package com.npms.core.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/master")
@CrossOrigin(origins = { "http://localhost:5195", "http://localhost:5190", "http://localhost:5173", "http://localhost:5174", "http://localhost:3000" })
public class MasterDataController {

    private final JdbcTemplate jdbcTemplate;

    public MasterDataController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/ministries")
    public ResponseEntity<Map<String, Object>> getMinistries() {
        List<Map<String, Object>> ministries = jdbcTemplate.queryForList(
            "SELECT id, code, name FROM master.ministries ORDER BY name ASC"
        );
        return ResponseEntity.ok(Map.of("success", true, "data", ministries));
    }

    @GetMapping("/departments")
    public ResponseEntity<Map<String, Object>> getDepartments(@RequestParam(required = false) String ministryId) {
        String query = "SELECT id, ministry_id AS \"ministryId\", code, name FROM master.departments";
        List<Map<String, Object>> departments;
        if (ministryId != null && !ministryId.isBlank()) {
            query += " WHERE ministry_id = ?::uuid ORDER BY name ASC";
            departments = jdbcTemplate.queryForList(query, ministryId);
        } else {
            query += " ORDER BY name ASC";
            departments = jdbcTemplate.queryForList(query);
        }
        return ResponseEntity.ok(Map.of("success", true, "data", departments));
    }

    @GetMapping("/states")
    public ResponseEntity<Map<String, Object>> getStates() {
        List<Map<String, Object>> states = jdbcTemplate.queryForList(
            "SELECT code, name FROM master.states ORDER BY name ASC"
        );
        return ResponseEntity.ok(Map.of("success", true, "data", states));
    }
}
