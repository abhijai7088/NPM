package com.npms.core.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Immutable event log entry for a {@link ProjectTicket}.
 *
 * The database trigger {@code ticket_event_immutable}
 * prevents any UPDATE or DELETE on this table.
 *
 * Event types:
 *   CREATED | ASSIGNED | STATUS_CHANGED | ESCALATED | COMMENTED
 *   REOPENED | RESOLVED | CLOSED | EVIDENCE_UPLOADED
 */
@Entity
@Table(name = "ticket_event", schema = "public")
public class TicketEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "ticket_id", nullable = false)
    private Long ticketId;

    /**
     * CREATED | ASSIGNED | STATUS_CHANGED | ESCALATED | COMMENTED
     * REOPENED | RESOLVED | CLOSED | EVIDENCE_UPLOADED
     */
    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "from_status")
    private String fromStatus;

    @Column(name = "to_status")
    private String toStatus;

    /** Actual authenticated username (JWT subject). */
    @Column(name = "performed_by", nullable = false)
    private String performedBy;

    /**
     * Non-null when MD uses delegated PM context.
     * E.g. "pm_atul_rastogi" when MD is acting as that PM.
     */
    @Column(name = "acting_as")
    private String actingAs;

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;

    @Column(name = "evidence_url", columnDefinition = "TEXT")
    private String evidenceUrl;

    @Column(name = "event_at", nullable = false, updatable = false)
    private LocalDateTime eventAt;

    @PrePersist
    protected void onCreate() {
        eventAt = LocalDateTime.now();
    }

    // ── Getters & Setters ──────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getTicketId() { return ticketId; }
    public void setTicketId(Long ticketId) { this.ticketId = ticketId; }

    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }

    public String getFromStatus() { return fromStatus; }
    public void setFromStatus(String fromStatus) { this.fromStatus = fromStatus; }

    public String getToStatus() { return toStatus; }
    public void setToStatus(String toStatus) { this.toStatus = toStatus; }

    public String getPerformedBy() { return performedBy; }
    public void setPerformedBy(String performedBy) { this.performedBy = performedBy; }

    public String getActingAs() { return actingAs; }
    public void setActingAs(String actingAs) { this.actingAs = actingAs; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public String getEvidenceUrl() { return evidenceUrl; }
    public void setEvidenceUrl(String evidenceUrl) { this.evidenceUrl = evidenceUrl; }

    public LocalDateTime getEventAt() { return eventAt; }
    public void setEventAt(LocalDateTime eventAt) { this.eventAt = eventAt; }
}
