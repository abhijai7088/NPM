package com.npms.erpsync.controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/erp-sync")
public class ErpSyncController {
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {
        return ResponseEntity.ok(Map.of("status", "OK", "lastSyncAt", "2026-07-05T12:00:00Z"));
    }
}