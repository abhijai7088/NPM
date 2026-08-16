const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-master-service/src/main/java/com/npms/master';

const files = {
  'controller/MinistryController.java': `package com.npms.master.controller;

import com.npms.master.entity.Ministry;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.UUID;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/master/ministries")
public class MinistryController {

    @GetMapping
    @Cacheable("ministries")
    public ResponseEntity<Map<String, Object>> getAllMinistries() {
        return ResponseEntity.ok(Map.of("success", true, "data", List.of(), "message", "Fetched ministries"));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    @CacheEvict(value = "ministries", allEntries = true)
    public ResponseEntity<Map<String, Object>> createMinistry(@RequestBody Ministry ministry) {
        return ResponseEntity.ok(Map.of("success", true, "data", ministry, "message", "Ministry created"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    @CacheEvict(value = "ministries", allEntries = true)
    public ResponseEntity<Map<String, Object>> updateMinistry(@PathVariable UUID id, @RequestBody Ministry ministry) {
        return ResponseEntity.ok(Map.of("success", true, "data", ministry, "message", "Ministry updated"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    @CacheEvict(value = "ministries", allEntries = true)
    public ResponseEntity<Map<String, Object>> deleteMinistry(@PathVariable UUID id) {
        return ResponseEntity.ok(Map.of("success", true, "data", null, "message", "Ministry deleted"));
    }
}`,

  'controller/UserManagementController.java': `package com.npms.master.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.UUID;
import java.util.List;

@RestController
@RequestMapping("/api/v1/master/users")
public class UserManagementController {

    @GetMapping
    @PreAuthorize("hasAnyAuthority('SUPER_ADMIN', 'MINISTRY_ADMIN')")
    public ResponseEntity<Map<String, Object>> getUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search) {
        return ResponseEntity.ok(Map.of(
                "success", true, "data", List.of(),
                "page", page, "size", size, "total", 0, "message", "Fetched users"
        ));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> createUser(@RequestBody Map<String, Object> request) {
        // Validation, BCrypt Hash, Save, Welcome Email, Audit
        return ResponseEntity.status(201).body(Map.of("success", true, "data", request, "message", "User created"));
    }

    @PutMapping("/{id}/activate")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> activateUser(@PathVariable UUID id) {
        return ResponseEntity.ok(Map.of("success", true, "message", "User activated"));
    }

    @PostMapping("/{id}/reset-password")
    @PreAuthorize("hasAuthority('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> resetPassword(@PathVariable UUID id) {
        String tempPass = "Finance@2026!"; // Dummy logic for scaffold
        return ResponseEntity.ok(Map.of("success", true, "data", Map.of("tempPassword", tempPass), "message", "Password reset successfully"));
    }
}`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Backend REST APIs for Phase 2 scaffolded.');
