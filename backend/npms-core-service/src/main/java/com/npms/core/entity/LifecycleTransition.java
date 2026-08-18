package com.npms.core.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Immutable audit record for every lifecycle stage transition.
 *
 * The database trigger {@code lifecycle_transition_immutable}
 * prevents any UPDATE or DELETE on this table.
 *
 * Transition types:
 *   FORWARD   — normal stage advance
 *   REOPEN    — stage rolled back (MD-only, mandatory remarks)
 *   HOLD      — project placed on financial hold
 *   RELEASE   — hold lifted
 *   HOLD_NOTE — note added while project is on hold
 */
@Entity
@Table(name = "lifecycle_transition", schema = "public")
public class LifecycleTransition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "header_id", nullable = false)
    private Long headerId;

    /** Null only for the initial DRAFT creation record. */
    @Column(name = "from_stage")
    private String fromStage;

    @Column(name = "to_stage", nullable = false)
    private String toStage;

    /** Actual authenticated username (JWT subject). */
    @Column(name = "performed_by", nullable = false)
    private String performedBy;

    /**
     * Non-null when an MD uses delegated PM context.
     * E.g. MD "md.alok_tiwari" acting as PM "pm_atul_rastogi".
     * Audit reads: "Performed by md.alok_tiwari, acting as pm_atul_rastogi".
     */
    @Column(name = "acting_as")
    private String actingAs;

    @Column(name = "remarks", nullable = false, columnDefinition = "TEXT")
    private String remarks;

    @Column(name = "evidence_url", columnDefinition = "TEXT")
    private String evidenceUrl;

    /**
     * FORWARD | REOPEN | HOLD | RELEASE | HOLD_NOTE
     */
    @Column(name = "transition_type", nullable = false)
    private String transitionType = "FORWARD";

    @Column(name = "transitioned_at", nullable = false, updatable = false)
    private LocalDateTime transitionedAt;

    @PrePersist
    protected void onCreate() {
        transitionedAt = LocalDateTime.now();
    }

    // ── Getters & Setters ──────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getHeaderId() { return headerId; }
    public void setHeaderId(Long headerId) { this.headerId = headerId; }

    public String getFromStage() { return fromStage; }
    public void setFromStage(String fromStage) { this.fromStage = fromStage; }

    public String getToStage() { return toStage; }
    public void setToStage(String toStage) { this.toStage = toStage; }

    public String getPerformedBy() { return performedBy; }
    public void setPerformedBy(String performedBy) { this.performedBy = performedBy; }

    public String getActingAs() { return actingAs; }
    public void setActingAs(String actingAs) { this.actingAs = actingAs; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }

    public String getEvidenceUrl() { return evidenceUrl; }
    public void setEvidenceUrl(String evidenceUrl) { this.evidenceUrl = evidenceUrl; }

    public String getTransitionType() { return transitionType; }
    public void setTransitionType(String transitionType) { this.transitionType = transitionType; }

    public LocalDateTime getTransitionedAt() { return transitionedAt; }
    public void setTransitionedAt(LocalDateTime transitionedAt) { this.transitionedAt = transitionedAt; }
}
