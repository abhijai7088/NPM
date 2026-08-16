package com.npms.auth.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.UUID;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.ArrayList;
import com.npms.auth.dto.response.AuditLogDto;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Service
public class AuditLogService {

    private static final Logger log = LoggerFactory.getLogger(AuditLogService.class);
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public AuditLogService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public void writeLog(UUID userId, String username, String action, String entityType,
                         UUID entityId, Object oldValue, Object newValue,
                         String ipAddress, String userAgent, String status, String errorMsg) {
        try {
            String oldValJson = oldValue != null ? objectMapper.writeValueAsString(oldValue) : null;
            String newValJson = newValue != null ? objectMapper.writeValueAsString(newValue) : null;
            
            String sql = "INSERT INTO audit.audit_logs (user_id, username, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent, status, error_message) VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::inet, ?, ?, ?)";
            
            jdbcTemplate.update(sql, userId, username, action, entityType, entityId, oldValJson, newValJson, ipAddress, userAgent, status, errorMsg);
        } catch (Exception e) {
            log.error("Failed to write audit log: {}", e.getMessage(), e);
        }
    }

    public Map<String, Object> getLogs(int page, int size, String username, String action, String entityType, String status, String from, String to) {
        StringBuilder sql = new StringBuilder("SELECT id, user_id, username, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent, status, error_message, created_at FROM audit.audit_logs WHERE 1=1");
        StringBuilder countSql = new StringBuilder("SELECT COUNT(*) FROM audit.audit_logs WHERE 1=1");
        
        List<Object> params = new ArrayList<>();
        
        if (username != null && !username.isBlank()) {
            sql.append(" AND username ILIKE ?");
            countSql.append(" AND username ILIKE ?");
            params.add("%" + username + "%");
        }
        if (action != null && !action.isBlank()) {
            sql.append(" AND action = ?");
            countSql.append(" AND action = ?");
            params.add(action);
        }
        if (entityType != null && !entityType.isBlank()) {
            sql.append(" AND entity_type ILIKE ?");
            countSql.append(" AND entity_type ILIKE ?");
            params.add("%" + entityType + "%");
        }
        if (status != null && !status.isBlank()) {
            sql.append(" AND status = ?");
            countSql.append(" AND status = ?");
            params.add(status);
        }
        if (from != null && !from.isBlank()) {
            sql.append(" AND created_at >= ?::timestamp");
            countSql.append(" AND created_at >= ?::timestamp");
            params.add(from);
        }
        if (to != null && !to.isBlank()) {
            sql.append(" AND created_at <= ?::timestamp");
            countSql.append(" AND created_at <= ?::timestamp");
            params.add(to);
        }
        
        long total = jdbcTemplate.queryForObject(countSql.toString(), Long.class, params.toArray());
        
        sql.append(" ORDER BY created_at DESC LIMIT ? OFFSET ?");
        params.add(size);
        params.add(page * size);
        
        List<AuditLogDto> logs = jdbcTemplate.query(sql.toString(), (rs, rowNum) -> {
            AuditLogDto dto = new AuditLogDto();
            dto.setId(UUID.fromString(rs.getString("id")));
            String userIdStr = rs.getString("user_id");
            if (userIdStr != null) dto.setUserId(UUID.fromString(userIdStr));
            dto.setUsername(rs.getString("username"));
            dto.setAction(rs.getString("action"));
            dto.setEntityType(rs.getString("entity_type"));
            String entityIdStr = rs.getString("entity_id");
            if (entityIdStr != null) dto.setEntityId(UUID.fromString(entityIdStr));
            dto.setOldValue(rs.getString("old_value"));
            dto.setNewValue(rs.getString("new_value"));
            dto.setIpAddress(rs.getString("ip_address"));
            dto.setUserAgent(rs.getString("user_agent"));
            dto.setStatus(rs.getString("status"));
            dto.setErrorMessage(rs.getString("error_message"));
            dto.setCreatedAt(rs.getTimestamp("created_at"));
            return dto;
        }, params.toArray());
        
        Map<String, Object> result = new HashMap<>();
        result.put("data", logs);
        result.put("total", total);
        result.put("page", page);
        result.put("size", size);
        return result;
    }
}