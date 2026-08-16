const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-core-service/src/main/java/com/npms/core';
const resourcesDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-core-service/src/main/resources';

const dirs = [
    'config', 'controller', 'service', 'repository', 'entity', 'dto/request', 'dto/response', 'security', 'event'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});
fs.mkdirSync(resourcesDir, { recursive: true });

fs.writeFileSync(path.join(resourcesDir, 'application.yml'), `server:
  port: 8083
spring:
  datasource:
    url: jdbc:postgresql://\${DB_HOST}:\${DB_PORT}/\${DB_NAME}
    username: \${DB_USER}
    password: \${DB_PASSWORD}
  jpa:
    hibernate.ddl-auto: validate
    properties.hibernate.default_schema: npms
  flyway:
    enabled: false
  kafka:
    bootstrap-servers: \${KAFKA_BOOTSTRAP}
jwt:
  public-key-path: \${JWT_PUBLIC_KEY_PATH}
`);

fs.writeFileSync(path.join(baseDir, 'CoreServiceApplication.java'), `package com.npms.core;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CoreServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(CoreServiceApplication.class, args);
    }
}
`);

const files = {
  'entity/ProjectStatus.java': `package com.npms.core.entity;
public enum ProjectStatus {
    DRAFT, SUBMITTED, APPROVED, REJECTED, IN_PROGRESS, COMPLETED, CANCELLED
}`,
  
  'entity/Project.java': `package com.npms.core.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "projects", schema = "npms")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Project {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @Column(name = "project_code", unique = true)
    private String projectCode;
    
    @Column(nullable = false)
    private String title;
    
    private String description;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProjectStatus status;
    
    @Column(name = "ministry_id")
    private UUID ministryId;
    
    @Column(name = "department_id")
    private UUID departmentId;
    
    @Column(name = "approved_budget")
    private Double approvedBudget;
    
    @Column(name = "start_date")
    private LocalDate startDate;
    
    @Column(name = "expected_end_date")
    private LocalDate expectedEndDate;
    
    @Version
    private Long version;
    
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (status == null) status = ProjectStatus.DRAFT;
    }
}`,

  'security/ProjectSecurityService.java': `package com.npms.core.security;
import com.npms.core.entity.Project;
import com.npms.core.entity.ProjectStatus;
import org.springframework.stereotype.Component;
import java.util.UUID;

@Component("projectSecurity")
public class ProjectSecurityService {
    public boolean canView(Object auth, Project project) {
        return true; // Scaffold logic
    }
    public boolean canEdit(Object auth, Project project) {
        return project.getStatus() == ProjectStatus.DRAFT;
    }
}`,

  'controller/ProjectController.java': `package com.npms.core.controller;

import com.npms.core.entity.Project;
import com.npms.core.entity.ProjectStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {

    @PostMapping
    @PreAuthorize("hasAnyAuthority('PROJECT_OFFICER', 'MINISTRY_ADMIN', 'SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> createProject(@RequestBody Project project) {
        project.setProjectCode("NPMS-MOD-2026-0001"); // Auto-gen scaffold
        project.setStatus(ProjectStatus.DRAFT);
        return ResponseEntity.status(201).body(Map.of("success", true, "data", project, "message", "Project Created"));
    }

    @GetMapping("/{id}")
    @PreAuthorize("@projectSecurity.canView(authentication, null)")
    public ResponseEntity<Map<String, Object>> getProject(@PathVariable UUID id) {
        return ResponseEntity.ok(Map.of("success", true, "message", "Project Details fetched"));
    }

    @PostMapping("/{id}/submit")
    public ResponseEntity<Map<String, Object>> submitProject(@PathVariable UUID id) {
        return ResponseEntity.ok(Map.of("success", true, "message", "Project submitted for approval"));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyAuthority('MINISTRY_ADMIN', 'SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> approveProject(@PathVariable UUID id) {
        return ResponseEntity.ok(Map.of("success", true, "message", "Project approved"));
    }

    @PostMapping("/{id}/documents")
    public ResponseEntity<Map<String, Object>> uploadDocument(@PathVariable UUID id, @RequestParam("file") MultipartFile file, @RequestParam("description") String description) {
        return ResponseEntity.status(201).body(Map.of("success", true, "message", "Document uploaded"));
    }
}`,

  'event/ProjectEventPublisher.java': `package com.npms.core.event;
import org.springframework.stereotype.Service;
import java.util.UUID;

@Service
public class ProjectEventPublisher {
    public void publishProjectStatusChange(String type, UUID projectId, String title, UUID recipientUserId, String recipientRole, UUID ministryId) {
        // Sends to topic: npms.notification.email
    }
}`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Core Service Backend scaffolded.');
