package com.npms.dashboard.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {

    @GetMapping("/summary")
    @Cacheable(value = "dashboard:summary", key = "#root.methodName")
    public ResponseEntity<Map<String, Object>> getSummary() {
        return ResponseEntity.ok(Map.of(
            "totalProjects", 42,
            "projectsByStatus", Map.of("DRAFT", 5, "APPROVED", 20),
            "totalApprovedBudget", 500000000,
            "totalSpent", 180000000,
            "utilizationPercent", 36
        ));
    }

    @GetMapping("/projects/monthly")
    @Cacheable(value = "dashboard:monthly", key = "#root.methodName")
    public ResponseEntity<List<Map<String, Object>>> getMonthlyProjects() {
        return ResponseEntity.ok(List.of(
            Map.of("month", "2026-01", "created", 5, "approved", 3)
        ));
    }
}