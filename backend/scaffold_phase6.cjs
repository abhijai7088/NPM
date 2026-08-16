const fs = require('fs');
const path = require('path');

const services = [
  {
    name: 'npms-notification-service',
    port: 8086,
    packages: ['controller', 'service', 'event', 'entity', 'repository'],
    files: {
      'event/NotificationListener.java': `package com.npms.notification.event;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

@Service
public class NotificationListener {
    @KafkaListener(topics = "npms.notification.email", groupId = "notification-group")
    public void processNotification(String eventJson) {
        // Parse event, build email from Thymeleaf, queue to DB, trigger sender
    }
}`,
      'service/EmailSenderService.java': `package com.npms.notification.service;
import org.springframework.stereotype.Service;

@Service
public class EmailSenderService {
    public void sendEmail(String to, String subject, String htmlBody) {
        // Connect to MailHog SMTP via Spring Mail
    }
}`,
      'controller/NotificationController.java': `package com.npms.notification.controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {
    @GetMapping("/count")
    public ResponseEntity<Map<String, Object>> getUnreadCount() {
        return ResponseEntity.ok(Map.of("unreadCount", 5));
    }
    @GetMapping(value = "/stream", produces = "text/event-stream")
    public String streamNotifications() {
        return "data: {\\"unreadCount\\": 5}\\n\\n";
    }
    @PutMapping("/read-all")
    public ResponseEntity<Map<String, Object>> markAllRead() {
        return ResponseEntity.ok(Map.of("success", true));
    }
}`
    }
  },
  {
    name: 'npms-erp-sync-service',
    port: 8084,
    packages: ['scheduler', 'controller', 'service'],
    files: {
      'scheduler/ErpSyncJob.java': `package com.npms.erpsync.scheduler;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ErpSyncJob {
    @Scheduled(fixedDelay = 900_000)
    public void syncFromErp() {
    }
    
    @Scheduled(fixedDelay = 60_000)
    public void checkSyncStaleness() {
    }
}`,
      'controller/ErpSyncController.java': `package com.npms.erpsync.controller;
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
}`
    }
  }
];

const basePath = 'c:/knowledge/Confidential/NICSI/npms/backend';

services.forEach(svc => {
  const srcPath = path.join(basePath, svc.name, 'src/main/java/com/npms', svc.name.replace('npms-', '').replace('-service', '').replace('-', ''));
  const resPath = path.join(basePath, svc.name, 'src/main/resources');
  
  svc.packages.forEach(pkg => {
    fs.mkdirSync(path.join(srcPath, pkg), { recursive: true });
  });
  fs.mkdirSync(resPath, { recursive: true });
  
  fs.writeFileSync(path.join(resPath, 'application.yml'), 'server:\\n  port: ' + svc.port + '\\nspring:\\n  datasource:\\n    url: jdbc:postgresql://localhost:5432/npms_db\\n');
  
  fs.writeFileSync(path.join(srcPath, 'Application.java'), 'package com.npms.' + svc.name.replace('npms-', '').replace('-service', '').replace('-', '') + ';\\nimport org.springframework.boot.SpringApplication;\\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\\nimport org.springframework.scheduling.annotation.EnableScheduling;\\n\\n@SpringBootApplication\\n@EnableScheduling\\npublic class Application {\\n    public static void main(String[] args) {\\n        SpringApplication.run(Application.class, args);\\n    }\\n}\\n');

  Object.entries(svc.files).forEach(([fPath, content]) => {
    fs.writeFileSync(path.join(srcPath, fPath), content);
  });
});

console.log('Phase 6 Notification and ERP Sync scaffolding complete.');
