package com.npms.aiservice.controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api/v1/ai")
public class AiController {
    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(@RequestBody Map<String, String> req) {
        return ResponseEntity.ok(Map.of(
            "success", true,
            "data", Map.of(
                "response", "The AI response text",
                "sources", List.of(),
                "queriesRemaining", 19
            )
        ));
    }
    
    @PostMapping("/ingest")
    public ResponseEntity<Map<String, Object>> ingest(@RequestBody Map<String, String> req) {
        return ResponseEntity.ok(Map.of("chunksCreated", 5));
    }
}