package com.npms.core.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Writes to the shared, immutable {@code audit.audit_logs} table (owned by
 * the auth-service schema, but readable/writable by any service sharing the
 * database). This mirrors {@code com.npms.auth.service.AuditLogService} so
 * every administrative action across services lands in one unified,
 * CERT-In-compliant audit trail queried by GET /api/v1/audit/logs.
 */
@Service
public class AuditLogService {

    private static final Logger log = LoggerFactory.getLogger(AuditLogService.class);

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public AuditLogService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Records one immutable audit entry. Never throws — a failed audit write
     * must not roll back or block the business transaction it describes.
     */
    public void writeLog(UUID userId, String username, String action, String entityType,
                          UUID entityId, Object oldValue, Object newValue,
                          String ipAddress, String userAgent, String status, String errorMsg) {
        try {
            String oldValJson = oldValue != null ? objectMapper.writeValueAsString(oldValue) : null;
            String newValJson = newValue != null ? objectMapper.writeValueAsString(newValue) : null;

            String sql = "INSERT INTO audit.audit_logs " +
                    "(user_id, username, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent, status, error_message) " +
                    "VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::inet, ?, ?, ?)";

            jdbcTemplate.update(sql, userId, username, action, entityType, entityId,
                    oldValJson, newValJson, ipAddress, userAgent, status, errorMsg);
        } catch (Exception e) {
            log.error("Failed to write audit log for action {}: {}", action, e.getMessage(), e);
        }
    }
}
