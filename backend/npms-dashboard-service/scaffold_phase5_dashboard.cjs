const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-dashboard-service/src/main/java/com/npms/dashboard';
const resourcesDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-dashboard-service/src/main/resources';

const dirs = [
    'config', 'controller', 'service', 'security'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});
fs.mkdirSync(resourcesDir, { recursive: true });

fs.writeFileSync(path.join(resourcesDir, 'application.yml'), `server:
  port: 8085
spring:
  datasource:
    url: jdbc:postgresql://\${DB_HOST}:\${DB_PORT}/\${DB_NAME}
    username: \${DB_USER}
    password: \${DB_PASSWORD}
  jpa:
    hibernate.ddl-auto: validate
  flyway:
    enabled: false
  cache:
    type: redis
  data:
    redis:
      host: \${REDIS_HOST}
      port: \${REDIS_PORT}
jwt:
  public-key-path: \${JWT_PUBLIC_KEY_PATH}
`);

fs.writeFileSync(path.join(baseDir, 'DashboardServiceApplication.java'), `package com.npms.dashboard;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@EnableCaching
public class DashboardServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(DashboardServiceApplication.class, args);
    }
}
`);

const files = {
  'controller/DashboardController.java': `package com.npms.dashboard.controller;

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
}`,

  'controller/ReportsController.java': `package com.npms.dashboard.controller;

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
}`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Phase 5 Dashboard Service scaffolded.');
