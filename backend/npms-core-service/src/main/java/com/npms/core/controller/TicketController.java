package com.npms.core.controller;

import com.npms.core.entity.ProjectTicket;
import com.npms.core.entity.TicketEvent;
import com.npms.core.exception.ForbiddenScopeException;
import com.npms.core.exception.NpmsBaseException;
import com.npms.core.security.AccessScope;
import com.npms.core.security.ScopeResolver;
import com.npms.core.service.TicketService;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REST API for the project ticket / work-item system.
 *
 * All write endpoints accept an optional {@code X-Acting-As-Pm} header.
 * When MD is acting as PM, the acting_as field propagates to TicketEvent.
 *
 * Endpoints:
 *   GET  /api/v1/tickets                        — list with optional filters
 *   POST /api/v1/tickets                        — create ticket (PMC/PM/MD)
 *   GET  /api/v1/tickets/{id}                   — get single ticket + events
 *   PUT  /api/v1/tickets/{id}/assign            — assign to OA (PM/PMC/MD)
 *   PUT  /api/v1/tickets/{id}/status            — update status (OA/PM)
 *   PUT  /api/v1/tickets/{id}/escalate          — escalate to PMC/MD
 *   POST /api/v1/tickets/{id}/reopen            — reopen (MD only, mandatory reason)
 *   POST /api/v1/tickets/{id}/comment           — add comment/evidence
 *   GET  /api/v1/tickets/{id}/events            — full event log (immutable)
 *   GET  /api/v1/tickets/overdue                — overdue tickets (PMC/MD)
 *   GET  /api/v1/tickets/escalated              — escalated tickets (PMC/MD)
 *   GET  /api/v1/tickets/my-tasks               — OA personal task list
 *   GET  /api/v1/tickets/priority-summary       — count open tickets by priority
 */
@RestController
@RequestMapping("/api/v1/tickets")
@CrossOrigin(origins = {"http://localhost:5195", "http://localhost:5190",
        "http://localhost:5173", "http://localhost:5174", "http://localhost:3000"})
public class TicketController {

    private final TicketService ticketService;
    private final ScopeResolver scopeResolver;
    private final JdbcTemplate  jdbcTemplate;

    public TicketController(TicketService ticketService, ScopeResolver scopeResolver, JdbcTemplate jdbcTemplate) {
        this.ticketService = ticketService;
        this.scopeResolver = scopeResolver;
        this.jdbcTemplate  = jdbcTemplate;
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/tickets?headerId=&status=&priority=
    // ─────────────────────────────────────────────────────────────

    @GetMapping({"", "/"})
    public ResponseEntity<Map<String, Object>> listTickets(
            Authentication authentication,
            @RequestParam(required = false) Long   headerId,
            @RequestParam(required = false) Long   prjMgrId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority) {

        AccessScope scope = scopeResolver.resolve(authentication);

        List<ProjectTicket> tickets;

        if (scope.isOa()) {
            // OA sees only their own assigned tickets
            tickets = ticketService.getByAssignedTo(scope.username());
        } else if (headerId != null) {
            // Explicit project filter
            tickets = ticketService.getByProject(headerId);
        } else if (prjMgrId != null && (scope.isMd() || scope.isSuperAdmin() || scope.isPmc())) {
            // MD/PMC filtering by a specific PM — fetch all headerIds for that PM then get their tickets
            List<Long> headerIds = jdbcTemplate.queryForList(
                "SELECT header_id FROM public.xx_nic_pm_prj_list WHERE prj_mgr_id = ?",
                Long.class, prjMgrId
            );
            if (headerIds.isEmpty()) {
                tickets = new ArrayList<>();
            } else {
                tickets = ticketService.getByHeaderIds(headerIds, status, priority);
            }
            // Status/priority already applied inside getByHeaderIds — skip outer filter
            return ResponseEntity.ok(Map.of(
                "success", true,
                "count",   tickets.size(),
                "data",    tickets.stream().map(this::serializeTicket).toList()
            ));
        } else if (scope.isPm()) {
            // PM sees only their own project tickets
            List<Long> allowed = scope.allowedPrjMgrIds();
            if (allowed == null || allowed.isEmpty()) {
                tickets = new ArrayList<>();
            } else {
                List<Long> headerIds = jdbcTemplate.queryForList(
                    "SELECT header_id FROM public.xx_nic_pm_prj_list WHERE prj_mgr_id IN (" +
                    String.join(",", allowed.stream().map(String::valueOf).toList()) + ")",
                    Long.class
                );
                tickets = headerIds.isEmpty() ? new ArrayList<>() :
                    ticketService.getByHeaderIds(headerIds, status, priority);
            }
        } else {
            // MD, PMC, Super Admin — org-wide view
            tickets = ticketService.getAllTickets();
        }

        // Apply in-memory status / priority filter (for non-prjMgrId paths)
        if (status != null && !status.isBlank()) {
            final String s = status;
            tickets = tickets.stream().filter(t -> s.equalsIgnoreCase(t.getStatus())).toList();
        }
        if (priority != null && !priority.isBlank()) {
            final String p = priority;
            tickets = tickets.stream().filter(t -> p.equalsIgnoreCase(t.getPriority())).toList();
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "count",   tickets.size(),
                "data",    tickets.stream().map(this::serializeTicket).toList()
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // POST /api/v1/tickets
    // ─────────────────────────────────────────────────────────────

    @PostMapping({"", "/"})
    public ResponseEntity<Map<String, Object>> createTicket(
            Authentication authentication,
            @RequestHeader(value = "X-Acting-As-Pm", required = false) String actingAsPmHeader,
            @RequestBody Map<String, Object> body) {

        AccessScope scope = scopeResolver.resolve(authentication);
        // OA cannot create tickets
        if (scope.isOa()) {
            throw ForbiddenScopeException.forResource("ticket creation (OA may not create tickets)");
        }

        Long headerId    = body.get("headerId") != null ? Long.parseLong(body.get("headerId").toString()) : null;
        String title     = (String) body.get("title");
        String desc      = (String) body.get("description");
        String type      = (String) body.get("ticketType");
        String priority  = (String) body.get("priority");
        String stageRef  = (String) body.get("stageRef");
        String assignedTo = (String) body.get("assignedTo");

        if (headerId == null) throw new NpmsBaseException("VALIDATION", "headerId is required.");
        if (title == null || title.isBlank()) throw new NpmsBaseException("VALIDATION", "title is required.");

        String actingAs = resolveActingAs(scope, actingAsPmHeader);

        ProjectTicket ticket = ticketService.createTicket(
                headerId, title, desc, type, priority, stageRef,
                scope.username(), actingAs);

        if (assignedTo != null && !assignedTo.isBlank()) {
            try {
                ticket = ticketService.assignTicket(
                        ticket.getId(), assignedTo.trim(), scope.username(), actingAs, "Assigned upon creation");
            } catch (Exception ignored) {}
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Ticket created: " + ticket.getTicketCode(),
                "data", serializeTicket(ticket)
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/tickets/{id}
    // ─────────────────────────────────────────────────────────────

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getTicket(
            Authentication authentication, @PathVariable Long id) {
        scopeResolver.resolve(authentication);
        ProjectTicket ticket = ticketService.getTicket(id)
                .orElseThrow(() -> new NpmsBaseException("NOT_FOUND", "Ticket #" + id + " not found."));
        List<TicketEvent> events = ticketService.getEvents(id);

        Map<String, Object> result = new HashMap<>();
        result.put("success", true);
        result.put("ticket", serializeTicket(ticket));
        result.put("events", events.stream().map(this::serializeEvent).toList());
        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────────────────────
    // PUT /api/v1/tickets/{id}/assign
    // Body: { assignTo, remarks }
    // ─────────────────────────────────────────────────────────────

    @PutMapping("/{id}/assign")
    public ResponseEntity<Map<String, Object>> assign(
            Authentication authentication,
            @RequestHeader(value = "X-Acting-As-Pm", required = false) String actingAsPmHeader,
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {

        AccessScope scope = scopeResolver.resolve(authentication);
        if (scope.isOa()) throw ForbiddenScopeException.forResource("ticket assignment (OA cannot assign)");

        String assignTo = body.get("assignTo");
        String remarks  = body.get("remarks");
        String actingAs = resolveActingAs(scope, actingAsPmHeader);

        if (assignTo == null || assignTo.isBlank()) {
            throw new NpmsBaseException("VALIDATION", "assignTo is required.");
        }

        ProjectTicket ticket = ticketService.assignTicket(
                id, assignTo, scope.username(), actingAs, remarks);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Ticket assigned to " + assignTo,
                "data", serializeTicket(ticket)
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // PUT /api/v1/tickets/{id}/status
    // Body: { status, remarks, evidenceUrl? }
    // ─────────────────────────────────────────────────────────────

    @PutMapping("/{id}/status")
    public ResponseEntity<Map<String, Object>> updateStatus(
            Authentication authentication,
            @RequestHeader(value = "X-Acting-As-Pm", required = false) String actingAsPmHeader,
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {

        AccessScope scope = scopeResolver.resolve(authentication);
        String newStatus   = body.get("status");
        String remarks     = body.get("remarks");
        String evidenceUrl = body.get("evidenceUrl");
        String actingAs    = resolveActingAs(scope, actingAsPmHeader);

        if (newStatus == null || newStatus.isBlank()) {
            throw new NpmsBaseException("VALIDATION", "status is required.");
        }

        ProjectTicket ticket = ticketService.updateStatus(
                id, newStatus, scope.username(), actingAs, remarks, evidenceUrl);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Ticket status updated to " + newStatus,
                "data", serializeTicket(ticket)
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // PUT /api/v1/tickets/{id}/escalate
    // Body: { escalateTo, remarks }
    // ─────────────────────────────────────────────────────────────

    @PutMapping("/{id}/escalate")
    public ResponseEntity<Map<String, Object>> escalate(
            Authentication authentication,
            @RequestHeader(value = "X-Acting-As-Pm", required = false) String actingAsPmHeader,
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {

        AccessScope scope  = scopeResolver.resolve(authentication);
        String escalateTo  = body.get("escalateTo");
        String remarks     = body.get("remarks");
        String actingAs    = resolveActingAs(scope, actingAsPmHeader);

        if (escalateTo == null || escalateTo.isBlank()) {
            throw new NpmsBaseException("VALIDATION", "escalateTo is required.");
        }

        ProjectTicket ticket = ticketService.escalateTicket(
                id, escalateTo, scope.username(), actingAs, remarks);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Ticket escalated to " + escalateTo,
                "data", serializeTicket(ticket)
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // POST /api/v1/tickets/{id}/reopen  (MD only)
    // Body: { reopenReason }
    // ─────────────────────────────────────────────────────────────

    @PostMapping("/{id}/reopen")
    public ResponseEntity<Map<String, Object>> reopen(
            Authentication authentication,
            @RequestHeader(value = "X-Acting-As-Pm", required = false) String actingAsPmHeader,
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {

        AccessScope scope = scopeResolver.resolve(authentication);
        if (!scope.isMd() && !scope.isSuperAdmin()) {
            throw ForbiddenScopeException.forResource("ticket reopen (MD only)");
        }

        String reopenReason = body.get("reopenReason");
        String actingAs     = resolveActingAs(scope, actingAsPmHeader);

        ProjectTicket ticket = ticketService.reopenTicket(
                id, scope.username(), actingAs, reopenReason);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "Ticket reopened.",
                "data", serializeTicket(ticket)
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // POST /api/v1/tickets/{id}/comment
    // Body: { comment, evidenceUrl? }
    // ─────────────────────────────────────────────────────────────

    @PostMapping("/{id}/comment")
    public ResponseEntity<Map<String, Object>> addComment(
            Authentication authentication,
            @RequestHeader(value = "X-Acting-As-Pm", required = false) String actingAsPmHeader,
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {

        AccessScope scope  = scopeResolver.resolve(authentication);
        String comment     = body.get("comment");
        String evidenceUrl = body.get("evidenceUrl");
        String actingAs    = resolveActingAs(scope, actingAsPmHeader);

        TicketEvent event = ticketService.addComment(
                id, scope.username(), actingAs, comment, evidenceUrl);

        return ResponseEntity.ok(Map.of(
                "success", true, "message", "Comment added.",
                "event", serializeEvent(event)
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/tickets/{id}/events
    // ─────────────────────────────────────────────────────────────

    @GetMapping("/{id}/events")
    public ResponseEntity<Map<String, Object>> getEvents(
            Authentication authentication, @PathVariable Long id) {
        scopeResolver.resolve(authentication);
        List<TicketEvent> events = ticketService.getEvents(id);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "count", events.size(),
                "data", events.stream().map(this::serializeEvent).toList()
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/tickets/overdue
    // ─────────────────────────────────────────────────────────────

    @GetMapping("/overdue")
    public ResponseEntity<Map<String, Object>> getOverdue(Authentication authentication) {
        AccessScope scope = scopeResolver.resolve(authentication);
        if (!scope.isMd() && !scope.isSuperAdmin() && !scope.isPmc()) {
            throw ForbiddenScopeException.forResource("overdue tickets report");
        }
        List<ProjectTicket> tickets = ticketService.getOverdueTickets();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "count", tickets.size(),
                "data", tickets.stream().map(this::serializeTicket).toList()
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/tickets/escalated
    // ─────────────────────────────────────────────────────────────

    @GetMapping("/escalated")
    public ResponseEntity<Map<String, Object>> getEscalated(Authentication authentication) {
        AccessScope scope = scopeResolver.resolve(authentication);
        if (!scope.isMd() && !scope.isSuperAdmin() && !scope.isPmc()) {
            throw ForbiddenScopeException.forResource("escalated tickets report");
        }
        List<ProjectTicket> tickets = ticketService.getEscalatedTickets();
        return ResponseEntity.ok(Map.of(
                "success", true,
                "count", tickets.size(),
                "data", tickets.stream().map(this::serializeTicket).toList()
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/tickets/my-tasks  (OA personal queue)
    // ─────────────────────────────────────────────────────────────

    @GetMapping("/my-tasks")
    public ResponseEntity<Map<String, Object>> myTasks(Authentication authentication) {
        AccessScope scope = scopeResolver.resolve(authentication);
        List<ProjectTicket> tickets = ticketService.getByAssignedTo(scope.username());
        return ResponseEntity.ok(Map.of(
                "success", true,
                "count", tickets.size(),
                "data", tickets.stream().map(this::serializeTicket).toList()
        ));
    }

    // ─────────────────────────────────────────────────────────────
    // GET /api/v1/tickets/priority-summary
    // ─────────────────────────────────────────────────────────────

    @GetMapping("/priority-summary")
    public ResponseEntity<Map<String, Object>> prioritySummary(Authentication authentication) {
        scopeResolver.resolve(authentication);
        List<Object[]> rows = ticketService.countOpenByPriority();
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : rows) {
            counts.put((String) row[0], (Long) row[1]);
        }
        return ResponseEntity.ok(Map.of("success", true, "data", counts));
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    private String resolveActingAs(AccessScope scope, String header) {
        if (header != null && !header.isBlank() && scope.isMd()) {
            return header.trim();
        }
        return null;
    }

    private Map<String, Object> serializeTicket(ProjectTicket t) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", t.getId());
        m.put("headerId", t.getHeaderId());
        m.put("ticketCode", t.getTicketCode());
        m.put("title", t.getTitle());
        m.put("description", t.getDescription());
        m.put("ticketType", t.getTicketType());
        m.put("priority", t.getPriority());
        m.put("status", t.getStatus());
        m.put("createdBy", t.getCreatedBy());
        m.put("assignedTo", t.getAssignedTo());
        m.put("reviewedBy", t.getReviewedBy());
        m.put("escalatedTo", t.getEscalatedTo());
        m.put("slaHours", t.getSlaHours());
        m.put("slaDeadline", t.getSlaDeadline());
        m.put("isOverdue", t.isOverdue());
        m.put("resolvedAt", t.getResolvedAt());
        m.put("closedAt", t.getClosedAt());
        m.put("reopenReason", t.getReopenReason());
        m.put("stageRef", t.getStageRef());
        m.put("createdAt", t.getCreatedAt());
        m.put("updatedAt", t.getUpdatedAt());
        return m;
    }

    private Map<String, Object> serializeEvent(TicketEvent e) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", e.getId());
        m.put("ticketId", e.getTicketId());
        m.put("eventType", e.getEventType());
        m.put("fromStatus", e.getFromStatus());
        m.put("toStatus", e.getToStatus());
        m.put("performedBy", e.getPerformedBy());
        m.put("actingAs", e.getActingAs());
        m.put("remarks", e.getRemarks());
        m.put("evidenceUrl", e.getEvidenceUrl());
        m.put("eventAt", e.getEventAt());
        return m;
    }
}
