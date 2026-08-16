package com.npms.auth.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "password_history", schema = "auth")
public class PasswordHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public PasswordHistory() {}

    public PasswordHistory(UUID id, User user, String passwordHash, LocalDateTime createdAt) {
        this.id = id;
        this.user = user;
        this.passwordHash = passwordHash;
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
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public static PasswordHistoryBuilder builder() {
        return new PasswordHistoryBuilder();
    }

    public static class PasswordHistoryBuilder {
        private UUID id;
        private User user;
        private String passwordHash;
        private LocalDateTime createdAt;

        public PasswordHistoryBuilder id(UUID id) { this.id = id; return this; }
        public PasswordHistoryBuilder user(User user) { this.user = user; return this; }
        public PasswordHistoryBuilder passwordHash(String passwordHash) { this.passwordHash = passwordHash; return this; }
        public PasswordHistoryBuilder createdAt(LocalDateTime createdAt) { this.createdAt = createdAt; return this; }

        public PasswordHistory build() {
            return new PasswordHistory(id, user, passwordHash, createdAt);
        }
    }
}