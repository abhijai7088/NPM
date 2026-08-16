package com.npms.auth.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "users", schema = "auth")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "mfa_enabled")
    private boolean mfaEnabled;

    @Column(name = "mfa_secret")
    private String mfaSecret;

    @Column(name = "is_active")
    private boolean isActive = true;

    @Column(name = "is_locked")
    private boolean isLocked = false;

    @Column(name = "requires_password_change")
    private boolean requiresPasswordChange = false;

    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    @Column(name = "failed_login_count")
    private int failedLoginCount = 0;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "ministry_id")
    private UUID ministryId;

    @Column(name = "department_id")
    private UUID departmentId;

    @Version
    private Long version;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
        name = "user_roles",
        schema = "auth",
        joinColumns = @JoinColumn(name = "user_id"),
        inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    private Set<Role> roles = new HashSet<>();

    public User() {}

    public User(UUID id, String username, String email, String fullName, String passwordHash,
                boolean mfaEnabled, String mfaSecret, boolean isActive, boolean isLocked,
                boolean requiresPasswordChange, LocalDateTime lockedUntil, int failedLoginCount,
                LocalDateTime lastLoginAt, UUID ministryId, UUID departmentId, Set<Role> roles) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.fullName = fullName;
        this.passwordHash = passwordHash;
        this.mfaEnabled = mfaEnabled;
        this.mfaSecret = mfaSecret;
        this.isActive = isActive;
        this.isLocked = isLocked;
        this.requiresPasswordChange = requiresPasswordChange;
        this.lockedUntil = lockedUntil;
        this.failedLoginCount = failedLoginCount;
        this.lastLoginAt = lastLoginAt;
        this.ministryId = ministryId;
        this.departmentId = departmentId;
        this.roles = roles != null ? roles : new HashSet<>();
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public boolean isMfaEnabled() { return mfaEnabled; }
    public void setMfaEnabled(boolean mfaEnabled) { this.mfaEnabled = mfaEnabled; }
    public String getMfaSecret() { return mfaSecret; }
    public void setMfaSecret(String mfaSecret) { this.mfaSecret = mfaSecret; }
    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { isActive = active; }
    public boolean isLocked() { return isLocked; }
    public void setLocked(boolean locked) { isLocked = locked; }
    public boolean isRequiresPasswordChange() { return requiresPasswordChange; }
    public void setRequiresPasswordChange(boolean requiresPasswordChange) { this.requiresPasswordChange = requiresPasswordChange; }
    public LocalDateTime getLockedUntil() { return lockedUntil; }
    public void setLockedUntil(LocalDateTime lockedUntil) { this.lockedUntil = lockedUntil; }
    public int getFailedLoginCount() { return failedLoginCount; }
    public void setFailedLoginCount(int failedLoginCount) { this.failedLoginCount = failedLoginCount; }
    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(LocalDateTime lastLoginAt) { this.lastLoginAt = lastLoginAt; }
    public UUID getMinistryId() { return ministryId; }
    public void setMinistryId(UUID ministryId) { this.ministryId = ministryId; }
    public UUID getDepartmentId() { return departmentId; }
    public void setDepartmentId(UUID departmentId) { this.departmentId = departmentId; }
    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }
    public Set<Role> getRoles() { return roles; }
    public void setRoles(Set<Role> roles) { this.roles = roles; }

    public static UserBuilder builder() {
        return new UserBuilder();
    }

    public static class UserBuilder {
        private UUID id;
        private String username;
        private String email;
        private String fullName;
        private String passwordHash;
        private boolean mfaEnabled;
        private String mfaSecret;
        private boolean isActive = true;
        private boolean isLocked = false;
        private boolean requiresPasswordChange = false;
        private LocalDateTime lockedUntil;
        private int failedLoginCount = 0;
        private LocalDateTime lastLoginAt;
        private UUID ministryId;
        private UUID departmentId;
        private Set<Role> roles = new HashSet<>();

        public UserBuilder id(UUID id) { this.id = id; return this; }
        public UserBuilder username(String username) { this.username = username; return this; }
        public UserBuilder email(String email) { this.email = email; return this; }
        public UserBuilder fullName(String fullName) { this.fullName = fullName; return this; }
        public UserBuilder passwordHash(String passwordHash) { this.passwordHash = passwordHash; return this; }
        public UserBuilder mfaEnabled(boolean mfaEnabled) { this.mfaEnabled = mfaEnabled; return this; }
        public UserBuilder mfaSecret(String mfaSecret) { this.mfaSecret = mfaSecret; return this; }
        public UserBuilder isActive(boolean isActive) { this.isActive = isActive; return this; }
        public UserBuilder isLocked(boolean isLocked) { this.isLocked = isLocked; return this; }
        public UserBuilder requiresPasswordChange(boolean requiresPasswordChange) { this.requiresPasswordChange = requiresPasswordChange; return this; }
        public UserBuilder lockedUntil(LocalDateTime lockedUntil) { this.lockedUntil = lockedUntil; return this; }
        public UserBuilder failedLoginCount(int failedLoginCount) { this.failedLoginCount = failedLoginCount; return this; }
        public UserBuilder lastLoginAt(LocalDateTime lastLoginAt) { this.lastLoginAt = lastLoginAt; return this; }
        public UserBuilder ministryId(UUID ministryId) { this.ministryId = ministryId; return this; }
        public UserBuilder departmentId(UUID departmentId) { this.departmentId = departmentId; return this; }
        public UserBuilder roles(Set<Role> roles) { this.roles = roles; return this; }

        public User build() {
            return new User(id, username, email, fullName, passwordHash, mfaEnabled, mfaSecret,
                            isActive, isLocked, requiresPasswordChange, lockedUntil, failedLoginCount,
                            lastLoginAt, ministryId, departmentId, roles);
        }
    }
}