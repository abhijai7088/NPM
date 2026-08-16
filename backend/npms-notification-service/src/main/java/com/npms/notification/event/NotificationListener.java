package com.npms.notification.event;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

@Service
public class NotificationListener {
    @KafkaListener(topics = "npms.notification.email", groupId = "notification-group")
    public void processNotification(String eventJson) {
        // Parse event, build email from Thymeleaf, queue to DB, trigger sender
    }
}