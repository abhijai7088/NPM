package com.npms.notification.controller;

import com.npms.notification.entity.Notification;
import com.npms.notification.repository.NotificationRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    @Autowired
    private NotificationRepository notificationRepository;

    @GetMapping
    public ResponseEntity<Map<String, Object>> getNotifications(@RequestParam UUID userId) {
        List<Notification> notifications = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
        return ResponseEntity.ok(Map.of("success", true, "data", notifications));
    }

    @GetMapping("/count")
    public ResponseEntity<Map<String, Object>> getUnreadCount(@RequestParam UUID userId) {
        long unreadCount = notificationRepository.countByUserIdAndIsReadFalse(userId);
        return ResponseEntity.ok(Map.of("success", true, "unreadCount", unreadCount));
    }

    @GetMapping(value = "/stream", produces = "text/event-stream")
    public String streamNotifications(@RequestParam UUID userId) {
        long unreadCount = notificationRepository.countByUserIdAndIsReadFalse(userId);
        return "data: {\"unreadCount\": " + unreadCount + "}\n\n";
    }

    @PutMapping("/read-all")
    @Transactional
    public ResponseEntity<Map<String, Object>> markAllRead(@RequestParam UUID userId) {
        int updated = notificationRepository.markAllAsReadForUser(userId, LocalDateTime.now());
        return ResponseEntity.ok(Map.of("success", true, "updatedCount", updated));
    }
}