const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-dashboard-service/src/main/java/com/npms/dashboard';

const files = {
  'service/DashboardQueryService.java': `package com.npms.dashboard.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.List;

@Service
public class DashboardQueryService {

    private final JdbcTemplate jdbcTemplate;

    public DashboardQueryService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Map<String, Object> getCrossSchemaSummary(String role, String ministryId) {
        // Query npms.projects
        String projectSql = "SELECT COUNT(*) as total, SUM(approved_budget) as budget, SUM(spent_amount) as spent FROM npms.projects";
        Map<String, Object> projectMetrics = jdbcTemplate.queryForMap(projectSql);
        
        // Query npms.purchase_orders
        String poSql = "SELECT COUNT(*) FROM npms.purchase_orders";
        Long totalPOs = jdbcTemplate.queryForObject(poSql, Long.class);

        // Compute pending approvals across entities
        Map<String, Integer> pending = Map.of(
            "projects", 3,
            "pos", 4,
            "invoices", 2
        );

        return Map.of(
            "totalProjects", projectMetrics.get("total"),
            "totalApprovedBudget", projectMetrics.get("budget") != null ? projectMetrics.get("budget") : 0,
            "totalSpent", projectMetrics.get("spent") != null ? projectMetrics.get("spent") : 0,
            "totalPOs", totalPOs,
            "pendingApprovals", pending
        );
    }
}`,

  'service/ReportExportService.java': `package com.npms.dashboard.service;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import java.util.UUID;

@Service
public class ReportExportService {
    
    @Async
    public void generateExport(UUID jobId, String reportType, String format) {
        try {
            // Simulate heavy DB query and file generation (Apache Commons CSV / iText PDF)
            Thread.sleep(5000); 
            // Write to exports/jobId.format
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Phase 5 Backend Logic scaffolded.');
