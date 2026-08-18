package com.npms.core.controller;

import com.npms.core.entity.LifecycleTransition;
import com.npms.core.entity.ProjectLifecycle;
import com.npms.core.exception.ForbiddenScopeException;
import com.npms.core.exception.NpmsBaseException;
import com.npms.core.repository.ProjectListRepository;
import com.npms.core.security.AccessScope;
import com.npms.core.security.ScopeResolver;
import com.npms.core.service.LifecycleService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST API for the project lifecycle state machine.
 *
 * All write endpoints accept an optional {@code X-Acting-As-Pm} header.
 * When present and caller is MD, the acting_as field is written to the
 * audit record (delegated PM context — no credential switch).
 *
 * Endpoints:
 *   GET  /api/v1/lifecycle/{headerId}           — current state + history
 *   POST /api/v1/lifecycle/{headerId}/transition — advance or reopen stage
 *   POST /api/v1/lifecycle/{headerId}/hold       — place on financial hold
 *   POST /api/v1/lifecycle/{headerId}/release    — release financial hold
 *   GET  /api/v1/lifecycle/overdue              — all overdue projects (PMC/MD)
 *   GET  /api/v1/lifecycle/on-hold              — all held projects (PMC/MD)
 *   GET  /api/v1/lifecycle/stage-counts         — KPI: count by stage
 */
@RestController
@RequestMapping("/api/v1/lifecycle")
@CrossOrigin(origins = {"http://localhost:5195", "http://localhost:5190",
        "http://localhost:5173", "http://localhost:5174", "http://localhost:3000"})
public class LifecycleController {

    private final LifecycleService lifecycleService;
    private final ScopeResolver scopeResolver;
    private final ProjectListRepository projectRepo;

    public LifecycleController(LifecycleService lifecycleService,
                                ScopeResolver scopeResolver,
                                ProjectListRepository projectRepo) {
        this.lifecycleService = lifecycleService;
        this.scopeResolver = scopeResolver;
        this.projectRepo = projectRepo;
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/lifecycle/{headerId}
    // Returns: { lifecycle, transitions, stageOrder }
    // ─────────────────────────────────────────────────────────────

    @GetMapping("/{headerId}")
    public ResponseEntity<Map<String, Object>> getLifecycle(
            Authentication authentication,
            @PathVariable Long headerId) {

        AccessScope scope = scopeResolver.resolve(authentication);
        assertProjectAccess(scope, headerId);

        // Ensure lifecycle row exists (idempotent)
        var project = projectRepo.findById(headerId).orElseThrow(
                () -> new NpmsBaseException("NOT_FOUND", "Project not found."));
        ProjectLifecycle pl = lifecycleService.ensureExists(headerId, project.getPrjMgrId());
        List<LifecycleTransition> history = lifecycleService.getHistory(headerId);

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("lifecycle", serializeLifecycle(pl));
        result.put("transitions", history.stream().map(this::serializeTransition).toList());
        result.put("stageOrder", lifecycleService.stageOrder());
        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────────────────────
    // POST /api/v1/lifecycle/{headerId}/transition
    // Body: { toStage, remarks, evidenceUrl?, reopen? }
    // ─────────────────────────────────────────────────────────────

    @PostMapping("/{headerId}/transition")
    public ResponseEntity<Map<String, Object>> transition(
            Authentication authentication,
            @RequestHeader(value = "X-Acting-As-Pm", required = false) String actingAsPmHeader,
            @PathVariable Long headerId,
            @RequestBody Map<String, String> body) {

        AccessScope scope = scopeResolver.resolve(authentication);
        assertProjectAccess(scope, headerId);

        String toStage   = body.get("toStage");
        String remarks   = body.get("remarks");
        String evidenceUrl = body.get("evidenceUrl");
        boolean reopen   = "true".equalsIgnoreCase(body.get("reopen"));

        if (toStage == null || toStage.isBlank()) {
            throw new NpmsBaseException("VALIDATION", "toStage is required.");
        }
        if (remarks == null || remarks.isBlank()) {
            throw new NpmsBaseException("VALIDATION", "remarks are required for every stage transition.");
        }

        String actingAs = resolveActingAs(scope, actingAsPmHeader);

        ProjectLifecycle pl;
        if (reopen) {
            if (!scope.isMd() && !scope.isSuperAdmin()) {
                throw ForbiddenScopeException.forResource("lifecycle reopen (MD only)");
            }
            pl = lifecycleService.reopenStage(headerId, toStage,
                    scope.username(), actingAs, remarks);
        } else {
            pl = lifecycleService.advanceStage(headerId, toStage,
                    scope.username(), actingAs, remarks, evidenceUrl);
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Stage advanced to " + pl.getCurrentStage(),
                "lifecycle", serializeLifecycle(pl)
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // POST /api/v1/lifecycle/{headerId}/hold
    // Body: { holdReason }
    // ─────────────────────────────────────────────────────────────

    @PostMapping("/{headerId}/hold")
    public ResponseEntity<Map<String, Object>> placeHold(
            Authentication authentication,
            @RequestHeader(value = "X-Acting-As-Pm", required = false) String actingAsPmHeader,
            @PathVariable Long headerId,
            @RequestBody Map<String, String> body) {

        AccessScope scope = scopeResolver.resolve(authentication);
        if (!scope.isMd() && !scope.isSuperAdmin() && !scope.isPmc()) {
            throw ForbiddenScopeException.forResource("financial hold (MD/PMC only)");
        }
        assertProjectAccess(scope, headerId);

        String holdReason = body.get("holdReason");
        String actingAs   = resolveActingAs(scope, actingAsPmHeader);

        ProjectLifecycle pl = lifecycleService.placeHold(
                headerId, scope.username(), actingAs, holdReason);

        return ResponseEntity.ok(Map.of(
                "success", true, "message", "Project placed on hold.",
                "lifecycle", serializeLifecycle(pl)));
    }

    // ─────────────────────────────────────────────────────────────
    // POST /api/v1/lifecycle/{headerId}/release
    // Body: { remarks }
    // ─────────────────────────────────────────────────────────────

    @PostMapping("/{headerId}/release")
    public ResponseEntity<Map<String, Object>> releaseHold(
            Authentication authentication,
            @RequestHeader(value = "X-Acting-As-Pm", required = false) String actingAsPmHeader,
            @PathVariable Long headerId,
            @RequestBody Map<String, String> body) {

        AccessScope scope = scopeResolver.resolve(authentication);
        if (!scope.isMd() && !scope.isSuperAdmin() && !scope.isPmc()) {
            throw ForbiddenScopeException.forResource("hold release (MD/PMC only)");
        }
        assertProjectAccess(scope, headerId);

        String remarks  = body.get("remarks");
        String actingAs = resolveActingAs(scope, actingAsPmHeader);

        ProjectLifecycle pl = lifecycleService.releaseHold(
                headerId, scope.username(), actingAs, remarks);

        return ResponseEntity.ok(Map.of(
                "success", true, "message", "Hold released.",
                "lifecycle", serializeLifecycle(pl)));
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/lifecycle/overdue
    // ─────────────────────────────────────────────────────────────

    @GetMapping("/overdue")
    public ResponseEntity<Map<String, Object>> getOverdue(Authentication authentication) {
        AccessScope scope = scopeResolver.resolve(authentication);
        if (!scope.isMd() && !scope.isSuperAdmin() && !scope.isPmc()) {
            throw ForbiddenScopeException.forResource("overdue projects report");
        }
        List<ProjectLifecycle> overdue = lifecycleService.getOverdueProjects();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "count", overdue.size(),
                "data", overdue.stream().map(this::serializeLifecycle).toList()
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/lifecycle/on-hold
    // ─────────────────────────────────────────────────────────────

    @GetMapping("/on-hold")
    public ResponseEntity<Map<String, Object>> getOnHold(Authentication authentication) {
        AccessScope scope = scopeResolver.resolve(authentication);
        if (!scope.isMd() && !scope.isSuperAdmin() && !scope.isPmc()) {
            throw ForbiddenScopeException.forResource("on-hold projects report");
        }
        List<ProjectLifecycle> held = lifecycleService.getProjectsOnHold();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "count", held.size(),
                "data", held.stream().map(this::serializeLifecycle).toList()
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/lifecycle/stage-counts
    // ─────────────────────────────────────────────────────────────

    @GetMapping("/stage-counts")
    public ResponseEntity<Map<String, Object>> getStageCounts(Authentication authentication) {
        scopeResolver.resolve(authentication); // validate auth only
        List<Object[]> rows = lifecycleService.countByStage();
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : rows) {
            counts.put((String) row[0], (Long) row[1]);
        }
        return ResponseEntity.ok(Map.of("success", true, "data", counts));
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private void assertProjectAccess(AccessScope scope, Long headerId) {
        if (scope.isUnrestricted()) return;
        if (scope.isPm() || scope.isMd()) {
            // Validate via project list — ensure the headerId belongs to their PM scope
            var project = projectRepo.findById(headerId).orElse(null);
            if (project == null) {
                throw new NpmsBaseException("NOT_FOUND", "Project not found.");
            }
            if (scope.allowedPrjMgrIds() != null &&
                !scope.allowedPrjMgrIds().contains(project.getPrjMgrId())) {
                throw ForbiddenScopeException.forResource("this project's lifecycle");
            }
        }
        // PMC and SUPER_ADMIN pass through
    }

    private String resolveActingAs(AccessScope scope, String header) {
        if (header != null && !header.isBlank() && scope.isMd()) {
            return header.trim();
        }
        return null;
    }

    private Map<String, Object> serializeLifecycle(ProjectLifecycle pl) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", pl.getId());
        m.put("headerId", pl.getHeaderId());
        m.put("currentStage", pl.getCurrentStage());
        m.put("assignedPmId", pl.getAssignedPmId());
        m.put("assignedOaUsername", pl.getAssignedOaUsername());
        m.put("slaDeadline", pl.getSlaDeadline());
        m.put("isOverdue", pl.isOverdue());
        m.put("isOnHold", pl.isOnHold());
        m.put("holdReason", pl.getHoldReason());
        m.put("notes", pl.getNotes());
        m.put("updatedAt", pl.getUpdatedAt());
        return m;
    }

    private Map<String, Object> serializeTransition(LifecycleTransition t) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", t.getId());
        m.put("headerId", t.getHeaderId());
        m.put("fromStage", t.getFromStage());
        m.put("toStage", t.getToStage());
        m.put("performedBy", t.getPerformedBy());
        m.put("actingAs", t.getActingAs());
        m.put("remarks", t.getRemarks());
        m.put("evidenceUrl", t.getEvidenceUrl());
        m.put("transitionType", t.getTransitionType());
        m.put("transitionedAt", t.getTransitionedAt());
        return m;
    }
}
