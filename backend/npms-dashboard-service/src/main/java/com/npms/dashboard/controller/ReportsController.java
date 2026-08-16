package com.npms.dashboard.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportsController {

    @PostMapping("/export")
    public ResponseEntity<Map<String, Object>> exportReport(@RequestBody Map<String, Object> req) {
        // Trigger Async job
        return ResponseEntity.status(202).body(Map.of("jobId", UUID.randomUUID().toString(), "status", "PENDING"));
    }

    @GetMapping("/export/{jobId}")
    public ResponseEntity<Map<String, Object>> checkExportStatus(@PathVariable UUID jobId) {
        return ResponseEntity.ok(Map.of("status", "READY", "downloadUrl", "/api/v1/reports/export/" + jobId + "/download"));
    }
}