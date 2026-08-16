package com.npms.core.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * Entity mapping to nicsi_erp.project_manager.
 * Represents a NICSI Project Manager (PM) — the RBAC actor whose
 * data scope is limited to the projects they own (prj_mgr_id).
 */
@Entity
@Table(name = "project_manager", schema = "public")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectManager {

    @Id
    @Column(name = "prj_mgr_id")
    private Long prjMgrId;

    @Column(name = "full_name")
    private String fullName;

    @Column(name = "designation")
    private String designation;

    @Column(name = "zone")
    private String zone;

    @Column(name = "email")
    private String email;

    @Column(name = "mobile")
    private String mobile;

    @Column(name = "is_active")
    private Boolean isActive;

    public Long getPrjMgrId() { return prjMgrId; }
    public void setPrjMgrId(Long prjMgrId) { this.prjMgrId = prjMgrId; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getDesignation() { return designation; }
    public void setDesignation(String designation) { this.designation = designation; }
    public String getZone() { return zone; }
    public void setZone(String zone) { this.zone = zone; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getMobile() { return mobile; }
    public void setMobile(String mobile) { this.mobile = mobile; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
}
