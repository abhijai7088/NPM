package com.npms.core.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

/**
 * Application login account for the NPMS RBAC hierarchy.
 * Maps to nicsi_erp.app_user.
 *
 * Roles: SUPER_ADMIN, MD (Managing Director), PM (Project Manager).
 * A PM account is linked to a zonal {@code project_manager} profile via prjMgrId.
 */
@Entity
@Table(name = "app_user", schema = "public")
@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
public class AppUser {

    @Id
    @Column(name = "username")
    private String username;

    @Column(name = "password")
    private String password;

    @Column(name = "full_name")
    private String fullName;

    @Column(name = "email")
    private String email;

    @Column(name = "role")
    private String role;

    @Column(name = "prj_mgr_id")
    private Long prjMgrId;

    @Column(name = "designation")
    private String designation;

    @Column(name = "zone")
    private String zone;

    @Column(name = "created_by")
    private String createdBy;

    /** The Managing Director (username) who oversees this PM. Null for SUPER_ADMIN / MD. */
    @Column(name = "managed_by")
    private String managedBy;

    @Column(name = "is_active")
    private Boolean isActive;

    @Column(name = "is_deleted")
    @Builder.Default
    private Boolean isDeleted = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public Long getPrjMgrId() { return prjMgrId; }
    public void setPrjMgrId(Long prjMgrId) { this.prjMgrId = prjMgrId; }
    public String getDesignation() { return designation; }
    public void setDesignation(String designation) { this.designation = designation; }
    public String getZone() { return zone; }
    public void setZone(String zone) { this.zone = zone; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public String getManagedBy() { return managedBy; }
    public void setManagedBy(String managedBy) { this.managedBy = managedBy; }
    public Boolean getIsActive() { return isActive; }
    public void setIsActive(Boolean isActive) { this.isActive = isActive; }
    public Boolean getIsDeleted() { return isDeleted; }
    public void setIsDeleted(Boolean isDeleted) { this.isDeleted = isDeleted; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public static AppUserBuilder builder() { return new AppUserBuilder(); }
    public AppUserBuilder toBuilder() {
        AppUserBuilder b = new AppUserBuilder();
        b.username(username).password(password).fullName(fullName).email(email)
         .role(role).prjMgrId(prjMgrId).designation(designation).zone(zone)
         .createdBy(createdBy).managedBy(managedBy).isActive(isActive).isDeleted(isDeleted).createdAt(createdAt);
        return b;
    }
    public static class AppUserBuilder {
        private AppUser u = new AppUser();
        public AppUserBuilder username(String val) { u.username = val; return this; }
        public AppUserBuilder password(String val) { u.password = val; return this; }
        public AppUserBuilder fullName(String val) { u.fullName = val; return this; }
        public AppUserBuilder email(String val) { u.email = val; return this; }
        public AppUserBuilder role(String val) { u.role = val; return this; }
        public AppUserBuilder prjMgrId(Long val) { u.prjMgrId = val; return this; }
        public AppUserBuilder designation(String val) { u.designation = val; return this; }
        public AppUserBuilder zone(String val) { u.zone = val; return this; }
        public AppUserBuilder createdBy(String val) { u.createdBy = val; return this; }
        public AppUserBuilder managedBy(String val) { u.managedBy = val; return this; }
        public AppUserBuilder isActive(Boolean val) { u.isActive = val; return this; }
        public AppUserBuilder isDeleted(Boolean val) { u.isDeleted = val; return this; }
        public AppUserBuilder createdAt(LocalDateTime val) { u.createdAt = val; return this; }
        public AppUser build() { return u; }
    }
}
