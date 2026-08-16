const fs = require('fs');
const path = require('path');

const svc = {
  name: 'npms-ai-service',
  port: 8087,
  packages: ['config', 'controller', 'service', 'security', 'util'],
  files: {
    'config/OllamaConfig.java': `package com.npms.aiservice.config;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OllamaConfig {
    // Scaffolded Ollama Models
}`,
    'util/InputSanitizer.java': `package com.npms.aiservice.util;
import org.springframework.stereotype.Component;

@Component
public class InputSanitizer {
    public String sanitize(String input) {
        // Block prompt injection patterns
        return input.trim();
    }
}`,
    'util/PiiScrubber.java': `package com.npms.aiservice.util;
import org.springframework.stereotype.Component;

@Component
public class PiiScrubber {
    public String scrub(String text) {
        return text;
    }
}`,
    'service/RagService.java': `package com.npms.aiservice.service;
import org.springframework.stereotype.Service;

@Service
public class RagService {
    public String searchAndChat(String query) {
        return "Scaffold AI response";
    }
}`,
    'controller/AiController.java': `package com.npms.aiservice.controller;
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
}`
  }
};

const basePath = 'c:/knowledge/Confidential/NICSI/npms/backend';
const srcPath = path.join(basePath, svc.name, 'src/main/java/com/npms/aiservice');
const resPath = path.join(basePath, svc.name, 'src/main/resources');

svc.packages.forEach(pkg => {
  fs.mkdirSync(path.join(srcPath, pkg), { recursive: true });
});
fs.mkdirSync(resPath, { recursive: true });

fs.writeFileSync(path.join(resPath, 'application.yml'), 'server:\\n  port: ' + svc.port + '\\nspring:\\n  datasource:\\n    url: jdbc:postgresql://localhost:5432/npms_db\\n');

fs.writeFileSync(path.join(srcPath, 'Application.java'), 'package com.npms.aiservice;\\nimport org.springframework.boot.SpringApplication;\\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\\n\\n@SpringBootApplication\\npublic class Application {\\n    public static void main(String[] args) {\\n        SpringApplication.run(Application.class, args);\\n    }\\n}\\n');

Object.entries(svc.files).forEach(([fPath, content]) => {
  fs.writeFileSync(path.join(srcPath, fPath), content);
});

console.log('Phase 7 AI Service scaffolding complete.');
