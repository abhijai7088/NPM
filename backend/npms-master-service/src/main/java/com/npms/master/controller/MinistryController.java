package com.npms.master.controller;

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
}