package com.npms.auth.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Stores OTP tokens for the forgot-password flow.
 * OTP is sent to the user's registered email and verified before allowing password reset.
 */
@Entity
@Table(name = "password_reset_tokens", schema = "auth")
public class PasswordResetToken {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** SHA-256 hash of the OTP (never store plaintext) */
    @Column(name = "otp_hash", nullable = false)
    private String otpHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "is_used")
    private boolean isUsed = false;

    @Column(name = "attempts")
    private int attempts = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public PasswordResetToken() {}

    public PasswordResetToken(UUID id, User user, String otpHash, LocalDateTime expiresAt, boolean isUsed, int attempts, LocalDateTime createdAt) {
        this.id = id;
        this.user = user;
        this.otpHash = otpHash;
        this.expiresAt = expiresAt;
        this.isUsed = isUsed;
        this.attempts = attempts;
        this.createdAt = createdAt;
    }

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getOtpHash() { return otpHash; }
    public void setOtpHash(String otpHash) { this.otpHash = otpHash; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
    public boolean isUsed() { return isUsed; }
    public void setUsed(boolean used) { isUsed = used; }
    public int getAttempts() { return attempts; }
    public void setAttempts(int attempts) { this.attempts = attempts; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public static PasswordResetTokenBuilder builder() {
        return new PasswordResetTokenBuilder();
    }

    public static class PasswordResetTokenBuilder {
        private UUID id;
        private User user;
        private String otpHash;
        private LocalDateTime expiresAt;
        private boolean isUsed = false;
        private int attempts = 0;
        private LocalDateTime createdAt;

        public PasswordResetTokenBuilder id(UUID id) { this.id = id; return this; }
        public PasswordResetTokenBuilder user(User user) { this.user = user; return this; }
        public PasswordResetTokenBuilder otpHash(String otpHash) { this.otpHash = otpHash; return this; }
        public PasswordResetTokenBuilder expiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; return this; }
        public PasswordResetTokenBuilder isUsed(boolean isUsed) { this.isUsed = isUsed; return this; }
        public PasswordResetTokenBuilder attempts(int attempts) { this.attempts = attempts; return this; }
        public PasswordResetTokenBuilder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }

        public PasswordResetToken build() {
            return new PasswordResetToken(id, user, otpHash, expiresAt, isUsed, attempts, createdAt);
        }
    }
}
