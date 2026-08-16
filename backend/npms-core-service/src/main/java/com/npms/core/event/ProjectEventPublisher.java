package com.npms.core.event;
import org.springframework.stereotype.Service;
import java.util.UUID;

@Service
public class ProjectEventPublisher {
    public void publishProjectStatusChange(String type, UUID projectId, String title, UUID recipientUserId, String recipientRole, UUID ministryId) {
        // Sends to topic: npms.notification.email
    }
}