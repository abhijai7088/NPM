package com.npms.core.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * Tracks the current lifecycle stage for a single project.
 * There is exactly one row per project (header_id = UNIQUE).
 *
 * Lifecycle stages (canonical state machine):
 *   DRAFT → SANCTION → RECEIPT → PO_ISSUED → BILL_SUBMITTED
 *         → APPROVAL_PENDING → PAYMENT_DONE → CLOSED
 *
 * Transitions are always written to {@link LifecycleTransition}
 * (immutable append-only log) alongside an update to this row.
 */
@Entity
@Table(name = "project_lifecycle", schema = "public")
public class ProjectLifecycle {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "header_id", nullable = false, unique = true)
    private Long headerId;

    @Column(name = "current_stage", nullable = false)
    private String currentStage = "DRAFT";

    /** prj_mgr_id of the PM responsible for this project's lifecycle. */
    @Column(name = "assigned_pm_id")
    private Long assignedPmId;

    /** Username of the OA currently executing the active stage. */
    @Column(name = "assigned_oa_username")
    private String assignedOaUsername;

    /** When the current stage SLA expires. Null = no SLA set. */
    @Column(name = "sla_deadline")
    private LocalDateTime slaDeadline;

    /** Non-null = project is on financial hold. Contains the hold reason. */
    @Column(name = "hold_reason", columnDefinition = "TEXT")
    private String holdReason;

    /** Internal notes visible to MD/PMC. */
    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    /** Returns true if the project is currently on financial hold. */
    @Transient
    public boolean isOnHold() {
        return holdReason != null && !holdReason.isBlank();
    }

    /** Returns true if the SLA deadline has passed. */
    @Transient
    public boolean isOverdue() {
        return slaDeadline != null && LocalDateTime.now().isAfter(slaDeadline);
    }

    // ── Getters & Setters ──────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getHeaderId() { return headerId; }
    public void setHeaderId(Long headerId) { this.headerId = headerId; }

    public String getCurrentStage() { return currentStage; }
    public void setCurrentStage(String currentStage) { this.currentStage = currentStage; }

    public Long getAssignedPmId() { return assignedPmId; }
    public void setAssignedPmId(Long assignedPmId) { this.assignedPmId = assignedPmId; }

    public String getAssignedOaUsername() { return assignedOaUsername; }
    public void setAssignedOaUsername(String assignedOaUsername) { this.assignedOaUsername = assignedOaUsername; }

    public LocalDateTime getSlaDeadline() { return slaDeadline; }
    public void setSlaDeadline(LocalDateTime slaDeadline) { this.slaDeadline = slaDeadline; }

    public String getHoldReason() { return holdReason; }
    public void setHoldReason(String holdReason) { this.holdReason = holdReason; }

    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
