package com.npms.core.service;

import com.npms.core.entity.LifecycleTransition;
import com.npms.core.entity.ProjectLifecycle;
import com.npms.core.exception.NpmsBaseException;
import com.npms.core.repository.LifecycleTransitionRepository;
import com.npms.core.repository.ProjectLifecycleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Business logic for the project lifecycle state machine.
 *
 * Stage progression (forward only):
 *   DRAFT → SANCTION → RECEIPT → PO_ISSUED → BILL_SUBMITTED
 *         → APPROVAL_PENDING → PAYMENT_DONE → CLOSED
 *
 * REOPEN transitions break the forward-only rule and require MD role.
 * HOLD / RELEASE do not change the current stage — they mark the hold_reason field.
 *
 * Every mutation writes an immutable {@link LifecycleTransition} record.
 */
@Service
public class LifecycleService {

    /** Ordered canonical stages. */
    private static final List<String> STAGE_ORDER = Arrays.asList(
            "DRAFT", "SANCTION", "RECEIPT", "PO_ISSUED",
            "BILL_SUBMITTED", "APPROVAL_PENDING", "PAYMENT_DONE", "CLOSED"
    );

    /** Default SLA in days for each stage. */
    private static final Map<String, Integer> STAGE_SLA_DAYS = Map.of(
            "SANCTION",          7,
            "RECEIPT",          14,
            "PO_ISSUED",        30,
            "BILL_SUBMITTED",   14,
            "APPROVAL_PENDING", 21,
            "PAYMENT_DONE",     14,
            "CLOSED",            0
    );

    private final ProjectLifecycleRepository lifecycleRepo;
    private final LifecycleTransitionRepository transitionRepo;

    public LifecycleService(ProjectLifecycleRepository lifecycleRepo,
                            LifecycleTransitionRepository transitionRepo) {
        this.lifecycleRepo = lifecycleRepo;
        this.transitionRepo = transitionRepo;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Read
    // ──────────────────────────────────────────────────────────────────────

    public Optional<ProjectLifecycle> getLifecycle(Long headerId) {
        return lifecycleRepo.findByHeaderId(headerId);
    }

    public List<LifecycleTransition> getHistory(Long headerId) {
        return transitionRepo.findByHeaderIdOrderByTransitionedAtDesc(headerId);
    }

    public List<ProjectLifecycle> getOverdueProjects() {
        return lifecycleRepo.findOverdueProjects();
    }

    public List<ProjectLifecycle> getProjectsOnHold() {
        return lifecycleRepo.findProjectsOnHold();
    }

    public List<Object[]> countByStage() {
        return lifecycleRepo.countByStage();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Ensure lifecycle row exists (idempotent)
    // ──────────────────────────────────────────────────────────────────────

    @Transactional
    public ProjectLifecycle ensureExists(Long headerId, Long pmId) {
        return lifecycleRepo.findByHeaderId(headerId).orElseGet(() -> {
            ProjectLifecycle pl = new ProjectLifecycle();
            pl.setHeaderId(headerId);
            pl.setCurrentStage("DRAFT");
            pl.setAssignedPmId(pmId);
            ProjectLifecycle saved = lifecycleRepo.save(pl);

            // Record initial DRAFT creation as first transition
            LifecycleTransition t = new LifecycleTransition();
            t.setHeaderId(headerId);
            t.setFromStage(null);
            t.setToStage("DRAFT");
            t.setPerformedBy("system");
            t.setRemarks("Lifecycle initialised for project.");
            t.setTransitionType("FORWARD");
            transitionRepo.save(t);

            return saved;
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Forward transition
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Advances the project to the next stage.
     *
     * @param headerId     the project's header_id
     * @param toStage      the target stage (must be the immediate next stage)
     * @param performedBy  the authenticated username making this call
     * @param actingAs     non-null when MD delegates context to a PM
     * @param remarks      mandatory remarks for the audit record
     * @param evidenceUrl  optional file reference
     */
    @Transactional
    public ProjectLifecycle advanceStage(Long headerId, String toStage,
                                         String performedBy, String actingAs,
                                         String remarks, String evidenceUrl) {
        ProjectLifecycle pl = lifecycleRepo.findByHeaderId(headerId)
                .orElseThrow(() -> new NpmsBaseException("NOT_FOUND",
                        "No lifecycle record for project " + headerId));

        if (pl.isOnHold()) {
            throw new NpmsBaseException("CONFLICT",
                    "Project is on financial hold. Release the hold before advancing the stage.");
        }

        validateForwardTransition(pl.getCurrentStage(), toStage);

        String prevStage = pl.getCurrentStage();
        pl.setCurrentStage(toStage);

        // Set SLA deadline for the new stage
        Integer slaDays = STAGE_SLA_DAYS.getOrDefault(toStage, 14);
        if (slaDays > 0) {
            pl.setSlaDeadline(LocalDateTime.now().plusDays(slaDays));
        } else {
            pl.setSlaDeadline(null);
        }

        lifecycleRepo.save(pl);

        // Write immutable audit record
        LifecycleTransition t = new LifecycleTransition();
        t.setHeaderId(headerId);
        t.setFromStage(prevStage);
        t.setToStage(toStage);
        t.setPerformedBy(performedBy);
        t.setActingAs(actingAs);
        t.setRemarks(remarks);
        t.setEvidenceUrl(evidenceUrl);
        t.setTransitionType("FORWARD");
        transitionRepo.save(t);

        return pl;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Reopen (MD only — roll stage back)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Reopens a project to an earlier stage. Only MD may perform this action.
     * The reason is mandatory and stored in both the lifecycle record and audit log.
     */
    @Transactional
    public ProjectLifecycle reopenStage(Long headerId, String toStage,
                                         String performedBy, String actingAs,
                                         String remarks) {
        if (remarks == null || remarks.trim().isEmpty()) {
            throw new NpmsBaseException("VALIDATION",
                    "Reopen remarks are mandatory. Please explain why this stage is being rolled back.");
        }

        ProjectLifecycle pl = lifecycleRepo.findByHeaderId(headerId)
                .orElseThrow(() -> new NpmsBaseException("NOT_FOUND",
                        "No lifecycle record for project " + headerId));

        String prevStage = pl.getCurrentStage();
        pl.setCurrentStage(toStage);
        pl.setSlaDeadline(LocalDateTime.now().plusDays(
                STAGE_SLA_DAYS.getOrDefault(toStage, 14)));

        lifecycleRepo.save(pl);

        LifecycleTransition t = new LifecycleTransition();
        t.setHeaderId(headerId);
        t.setFromStage(prevStage);
        t.setToStage(toStage);
        t.setPerformedBy(performedBy);
        t.setActingAs(actingAs);
        t.setRemarks(remarks);
        t.setTransitionType("REOPEN");
        transitionRepo.save(t);

        return pl;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Financial Hold / Release
    // ──────────────────────────────────────────────────────────────────────

    @Transactional
    public ProjectLifecycle placeHold(Long headerId, String performedBy,
                                       String actingAs, String holdReason) {
        if (holdReason == null || holdReason.trim().isEmpty()) {
            throw new NpmsBaseException("VALIDATION", "Hold reason is mandatory.");
        }
        ProjectLifecycle pl = lifecycleRepo.findByHeaderId(headerId)
                .orElseThrow(() -> new NpmsBaseException("NOT_FOUND", "Project lifecycle not found."));

        pl.setHoldReason(holdReason);
        lifecycleRepo.save(pl);

        LifecycleTransition t = new LifecycleTransition();
        t.setHeaderId(headerId);
        t.setFromStage(pl.getCurrentStage());
        t.setToStage(pl.getCurrentStage()); // stage unchanged
        t.setPerformedBy(performedBy);
        t.setActingAs(actingAs);
        t.setRemarks("HOLD PLACED: " + holdReason);
        t.setTransitionType("HOLD");
        transitionRepo.save(t);

        return pl;
    }

    @Transactional
    public ProjectLifecycle releaseHold(Long headerId, String performedBy,
                                         String actingAs, String releaseRemarks) {
        ProjectLifecycle pl = lifecycleRepo.findByHeaderId(headerId)
                .orElseThrow(() -> new NpmsBaseException("NOT_FOUND", "Project lifecycle not found."));

        pl.setHoldReason(null);
        lifecycleRepo.save(pl);

        LifecycleTransition t = new LifecycleTransition();
        t.setHeaderId(headerId);
        t.setFromStage(pl.getCurrentStage());
        t.setToStage(pl.getCurrentStage());
        t.setPerformedBy(performedBy);
        t.setActingAs(actingAs);
        t.setRemarks("HOLD RELEASED: " + (releaseRemarks != null ? releaseRemarks : ""));
        t.setTransitionType("RELEASE");
        transitionRepo.save(t);

        return pl;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────

    private void validateForwardTransition(String from, String to) {
        int fromIdx = STAGE_ORDER.indexOf(from);
        int toIdx   = STAGE_ORDER.indexOf(to);

        if (toIdx < 0) {
            throw new NpmsBaseException("VALIDATION", "Unknown stage: " + to);
        }
        if (fromIdx < 0) {
            throw new NpmsBaseException("VALIDATION", "Unknown current stage: " + from);
        }
        if (toIdx != fromIdx + 1) {
            throw new NpmsBaseException("VALIDATION",
                    String.format("Invalid transition: %s → %s. Stages must advance one step at a time.", from, to));
        }
    }

    public List<String> stageOrder() {
        return STAGE_ORDER;
    }
}
