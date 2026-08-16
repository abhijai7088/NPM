package com.npms.master.controller;

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
}