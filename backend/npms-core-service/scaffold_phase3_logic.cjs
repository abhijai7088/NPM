const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-core-service/src/main/java/com/npms/core';

const dirs = [
    'repository', 'specification'
];

dirs.forEach(d => {
    fs.mkdirSync(path.join(baseDir, d), { recursive: true });
});

const files = {
  'repository/ProjectRepository.java': `package com.npms.core.repository;

import com.npms.core.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;
import java.util.UUID;

@Repository
public interface ProjectRepository extends JpaRepository<Project, UUID>, JpaSpecificationExecutor<Project> {
    long countByMinistryIdAndCreatedAtYear(UUID ministryId, int year);
}`,

  'specification/ProjectSpecification.java': `package com.npms.core.specification;

import com.npms.core.entity.Project;
import org.springframework.data.jpa.domain.Specification;
import java.util.UUID;
import java.util.List;
import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;

public class ProjectSpecification {
    public static Specification<Project> filterProjects(
            String status, UUID ministryId, UUID departmentId, UUID categoryId, String search) {
        
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            
            if (status != null && !status.isEmpty()) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (ministryId != null) {
                predicates.add(cb.equal(root.get("ministryId"), ministryId));
            }
            if (departmentId != null) {
                predicates.add(cb.equal(root.get("departmentId"), departmentId));
            }
            if (search != null && !search.isEmpty()) {
                String likePattern = "%" + search.toLowerCase() + "%";
                predicates.add(cb.or(
                    cb.like(cb.lower(root.get("title")), likePattern),
                    cb.like(cb.lower(root.get("projectCode")), likePattern)
                ));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}`,

  'controller/ProjectController.java': `package com.npms.core.controller;

import com.npms.core.entity.Project;
import com.npms.core.entity.ProjectStatus;
import com.npms.core.repository.ProjectRepository;
import com.npms.core.specification.ProjectSpecification;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import java.util.Map;
import java.util.UUID;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {

    private final ProjectRepository projectRepository;
    
    public ProjectController(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    @PostMapping
    @PreAuthorize("hasAnyAuthority('PROJECT_OFFICER', 'MINISTRY_ADMIN', 'SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> createProject(@RequestBody Project project) {
        // Implement auto-generate project_code
        long count = projectRepository.count(); // Mock sequence logic
        project.setProjectCode(String.format("NPMS-MOD-2026-%04d", count + 1));
        project.setStatus(ProjectStatus.DRAFT);
        Project saved = projectRepository.save(project);
        return ResponseEntity.status(201).body(Map.of("success", true, "data", saved, "message", "Project Created"));
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getProjects(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) UUID ministryId,
            @RequestParam(required = false) String search) {
        
        Page<Project> projects = projectRepository.findAll(
            ProjectSpecification.filterProjects(status, ministryId, null, null, search),
            PageRequest.of(page, size)
        );
        
        return ResponseEntity.ok(Map.of(
            "success", true, "data", projects.getContent(),
            "total", projects.getTotalElements(), "message", "Fetched projects"
        ));
    }

    @GetMapping("/{id}")
    @PreAuthorize("@projectSecurity.canView(authentication, null)")
    public ResponseEntity<Map<String, Object>> getProject(@PathVariable UUID id) {
        return projectRepository.findById(id)
            .map(p -> ResponseEntity.ok(Map.of("success", true, "data", p, "message", "Project Details fetched")))
            .orElseGet(() -> ResponseEntity.status(404).body(Map.of("success", false, "message", "Project not found")));
    }

    @PutMapping("/{id}")
    @PreAuthorize("@projectSecurity.canEdit(authentication, null)")
    public ResponseEntity<Map<String, Object>> updateProject(@PathVariable UUID id, @RequestBody Project project) {
        return ResponseEntity.ok(Map.of("success", true, "data", project, "message", "Project updated"));
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
        try {
            String dirPath = "uploads/projects/" + id.toString();
            Files.createDirectories(Paths.get(dirPath));
            Path filePath = Paths.get(dirPath, UUID.randomUUID().toString() + "_" + file.getOriginalFilename());
            Files.write(filePath, file.getBytes());
            return ResponseEntity.status(201).body(Map.of("success", true, "message", "Document uploaded successfully", "data", filePath.toString()));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("success", false, "message", "Failed to upload document"));
        }
    }
}`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Project Phase 3 Business Logic Scaffolded.');
