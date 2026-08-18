package com.npms.core.service;

import com.npms.core.entity.ProjectTicket;
import com.npms.core.entity.TicketEvent;
import com.npms.core.exception.NpmsBaseException;
import com.npms.core.repository.ProjectTicketRepository;
import com.npms.core.repository.TicketEventRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.Year;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Business logic for the project ticket (work-item) system.
 *
 * Ticket code format: TKT-YYYY-NNNNNN (e.g. TKT-2026-000042)
 * Generated in-app as a thread-safe counter (reset per year).
 *
 * Status machine:
 *   OPEN → IN_PROGRESS → AWAITING_REVIEW → RESOLVED → CLOSED
 *   CLOSED / RESOLVED → REOPENED (MD only, mandatory reason)
 */
@Service
public class TicketService {

    /** Default SLA hours by priority level. */
    private static final Map<String, Integer> PRIORITY_SLA_HOURS = Map.of(
            "CRITICAL",  8,
            "HIGH",     24,
            "MEDIUM",   48,
            "LOW",      72
    );

    /** In-memory ticket sequence counter (initialised from DB count on first use). */
    private final AtomicLong ticketSeq = new AtomicLong(0);
    private int seqYear = Year.now().getValue();

    private final ProjectTicketRepository ticketRepo;
    private final TicketEventRepository   eventRepo;

    public TicketService(ProjectTicketRepository ticketRepo,
                         TicketEventRepository eventRepo) {
        this.ticketRepo = ticketRepo;
        this.eventRepo  = eventRepo;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Read
    // ──────────────────────────────────────────────────────────────────────

    public Optional<ProjectTicket> getTicket(Long id) {
        return ticketRepo.findById(id);
    }

    public List<ProjectTicket> getAllTickets() {
        return ticketRepo.findAll(
            org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Direction.DESC, "createdAt")
        );
    }

    public List<ProjectTicket> getByProject(Long headerId) {
        return ticketRepo.findByHeaderIdOrderByCreatedAtDesc(headerId);
    }

    /** Fetch tickets for a set of project headerIds with optional status/priority filters. */
    public List<ProjectTicket> getByHeaderIds(List<Long> headerIds, String status, String priority) {
        return ticketRepo.searchTickets(headerIds, status, priority);
    }

    public List<ProjectTicket> getActiveByProject(Long headerId) {
        return ticketRepo.findActiveByHeaderId(headerId);
    }

    public List<ProjectTicket> getByAssignedTo(String username) {
        return ticketRepo.findByAssignedToOrderByCreatedAtDesc(username);
    }

    public List<ProjectTicket> getOverdueTickets() {
        return ticketRepo.findOverdueTickets();
    }

    public List<ProjectTicket> getEscalatedTickets() {
        return ticketRepo.findEscalatedTickets();
    }

    public List<TicketEvent> getEvents(Long ticketId) {
        return eventRepo.findByTicketIdOrderByEventAtDesc(ticketId);
    }

    public List<Object[]> countOpenByPriority() {
        return ticketRepo.countOpenByPriority();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Create
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Creates a new ticket for a project.
     *
     * @param headerId    project header_id
     * @param title       short summary
     * @param description full description
     * @param ticketType  DOCUMENT_UPLOAD | FIELD_VISIT | CLIENT_FOLLOW_UP | etc.
     * @param priority    LOW | MEDIUM | HIGH | CRITICAL
     * @param stageRef    optional lifecycle stage association
     * @param createdBy   authenticated username
     * @param actingAs    delegated context (MD acting as PM)
     * @return the saved ticket
     */
    @Transactional
    public ProjectTicket createTicket(Long headerId, String title, String description,
                                       String ticketType, String priority,
                                       String stageRef, String createdBy, String actingAs) {
        ProjectTicket ticket = new ProjectTicket();
        ticket.setHeaderId(headerId);
        ticket.setTicketCode(generateCode());
        ticket.setTitle(title);
        ticket.setDescription(description);
        ticket.setTicketType(ticketType != null ? ticketType : "GENERAL");
        ticket.setPriority(priority != null ? priority : "MEDIUM");
        ticket.setStatus("OPEN");
        ticket.setCreatedBy(createdBy);
        ticket.setStageRef(stageRef);

        int slaHours = PRIORITY_SLA_HOURS.getOrDefault(ticket.getPriority(), 48);
        ticket.setSlaHours(slaHours);
        ticket.setSlaDeadline(LocalDateTime.now().plusHours(slaHours));

        ProjectTicket saved = ticketRepo.save(ticket);

        // Immutable creation event
        appendEvent(saved.getId(), "CREATED", null, "OPEN",
                createdBy, actingAs, "Ticket created.", null);

        return saved;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Assign to OA
    // ──────────────────────────────────────────────────────────────────────

    @Transactional
    public ProjectTicket assignTicket(Long ticketId, String assignToUsername,
                                       String performedBy, String actingAs, String remarks) {
        ProjectTicket ticket = requireTicket(ticketId);

        String prevStatus = ticket.getStatus();
        ticket.setAssignedTo(assignToUsername);
        if ("OPEN".equals(ticket.getStatus())) {
            ticket.setStatus("IN_PROGRESS");
        }

        ticketRepo.save(ticket);
        appendEvent(ticketId, "ASSIGNED", prevStatus, ticket.getStatus(),
                performedBy, actingAs,
                "Assigned to " + assignToUsername + ". " + (remarks != null ? remarks : ""), null);

        return ticket;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Status update
    // ──────────────────────────────────────────────────────────────────────

    @Transactional
    public ProjectTicket updateStatus(Long ticketId, String newStatus,
                                       String performedBy, String actingAs,
                                       String remarks, String evidenceUrl) {
        ProjectTicket ticket = requireTicket(ticketId);

        validateStatusTransition(ticket.getStatus(), newStatus);

        String prevStatus = ticket.getStatus();
        ticket.setStatus(newStatus);

        if ("RESOLVED".equals(newStatus)) {
            ticket.setResolvedAt(LocalDateTime.now());
        }
        if ("CLOSED".equals(newStatus)) {
            ticket.setClosedAt(LocalDateTime.now());
        }

        ticketRepo.save(ticket);
        appendEvent(ticketId, "STATUS_CHANGED", prevStatus, newStatus,
                performedBy, actingAs, remarks, evidenceUrl);

        return ticket;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Escalation
    // ──────────────────────────────────────────────────────────────────────

    @Transactional
    public ProjectTicket escalateTicket(Long ticketId, String escalateTo,
                                         String performedBy, String actingAs, String remarks) {
        ProjectTicket ticket = requireTicket(ticketId);
        ticket.setEscalatedTo(escalateTo);
        ticketRepo.save(ticket);

        appendEvent(ticketId, "ESCALATED", ticket.getStatus(), ticket.getStatus(),
                performedBy, actingAs,
                "Escalated to " + escalateTo + ". " + (remarks != null ? remarks : ""), null);

        return ticket;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Reopen (MD only)
    // ──────────────────────────────────────────────────────────────────────

    @Transactional
    public ProjectTicket reopenTicket(Long ticketId, String performedBy,
                                       String actingAs, String reopenReason) {
        if (reopenReason == null || reopenReason.trim().isEmpty()) {
            throw new NpmsBaseException("VALIDATION",
                    "Reopen reason is mandatory. Please explain why this ticket is being reopened.");
        }

        ProjectTicket ticket = requireTicket(ticketId);

        if (!"RESOLVED".equals(ticket.getStatus()) && !"CLOSED".equals(ticket.getStatus())) {
            throw new NpmsBaseException("CONFLICT",
                    "Only RESOLVED or CLOSED tickets can be reopened.");
        }

        String prevStatus = ticket.getStatus();
        ticket.setStatus("REOPENED");
        ticket.setReopenReason(reopenReason);
        ticket.setResolvedAt(null);
        ticket.setClosedAt(null);

        // Reset SLA from now
        int slaHours = PRIORITY_SLA_HOURS.getOrDefault(ticket.getPriority(), 48);
        ticket.setSlaDeadline(LocalDateTime.now().plusHours(slaHours));

        ticketRepo.save(ticket);

        appendEvent(ticketId, "REOPENED", prevStatus, "REOPENED",
                performedBy, actingAs, "REOPEN: " + reopenReason, null);

        return ticket;
    }

    // ──────────────────────────────────────────────────────────────────────
    // Add comment / evidence
    // ──────────────────────────────────────────────────────────────────────

    @Transactional
    public TicketEvent addComment(Long ticketId, String performedBy,
                                   String actingAs, String comment, String evidenceUrl) {
        requireTicket(ticketId);
        String evtType = evidenceUrl != null && !evidenceUrl.isBlank()
                ? "EVIDENCE_UPLOADED" : "COMMENTED";
        return appendEvent(ticketId, evtType, null, null,
                performedBy, actingAs, comment, evidenceUrl);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────

    private ProjectTicket requireTicket(Long id) {
        return ticketRepo.findById(id).orElseThrow(() ->
                new NpmsBaseException("NOT_FOUND", "Ticket #" + id + " not found."));
    }

    private TicketEvent appendEvent(Long ticketId, String eventType,
                                     String fromStatus, String toStatus,
                                     String performedBy, String actingAs,
                                     String remarks, String evidenceUrl) {
        TicketEvent evt = new TicketEvent();
        evt.setTicketId(ticketId);
        evt.setEventType(eventType);
        evt.setFromStatus(fromStatus);
        evt.setToStatus(toStatus);
        evt.setPerformedBy(performedBy);
        evt.setActingAs(actingAs);
        evt.setRemarks(remarks);
        evt.setEvidenceUrl(evidenceUrl);
        return eventRepo.save(evt);
    }

    private void validateStatusTransition(String from, String to) {
        // Closed tickets can only be reopened via reopenTicket()
        if ("CLOSED".equals(from) || "RESOLVED".equals(from)) {
            throw new NpmsBaseException("CONFLICT",
                    "Cannot update status of a " + from + " ticket directly. Use the reopen endpoint.");
        }
        // Basic forward-only validation
        List<String> order = List.of("OPEN", "IN_PROGRESS", "AWAITING_REVIEW", "RESOLVED", "CLOSED");
        int fromIdx = order.indexOf(from);
        int toIdx   = order.indexOf(to);
        if (toIdx < 0) {
            throw new NpmsBaseException("VALIDATION", "Unknown ticket status: " + to);
        }
        if (fromIdx >= 0 && toIdx < fromIdx) {
            throw new NpmsBaseException("VALIDATION",
                    "Cannot move ticket backward from " + from + " to " + to);
        }
    }

    private synchronized String generateCode() {
        int currentYear = Year.now().getValue();
        if (currentYear != seqYear) {
            seqYear = currentYear;
            ticketSeq.set(0);
        }
        long seq = ticketSeq.incrementAndGet();
        return String.format("TKT-%d-%06d", currentYear, seq);
    }
}
