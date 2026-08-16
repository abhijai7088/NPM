package com.npms.auth.entity;

import jakarta.persistence.*;
import java.util.UUID;

/**
 * Represents a fine-grained permission in the RBAC model.
 * Permissions are grouped by module and assigned to roles.
 */
@Entity
@Table(name = "permissions", schema = "auth")
public class Permission {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Unique permission code e.g. PROJECT_CREATE, PO_APPROVE, USER_MANAGE */
    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String name;

    private String description;

    /** Logical grouping: AUTH, PROJECT, PO, INVOICE, PAYMENT, MASTER, ADMIN */
    @Column(nullable = false)
    private String module;

    public Permission() {}

    public Permission(UUID id, String code, String name, String description, String module) {
        this.id = id;
        this.code = code;
        this.name = name;
        this.description = description;
        this.module = module;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getModule() { return module; }
    public void setModule(String module) { this.module = module; }
}
