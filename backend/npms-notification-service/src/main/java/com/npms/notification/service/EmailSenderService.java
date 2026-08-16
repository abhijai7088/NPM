package com.npms.notification.service;
import org.springframework.stereotype.Service;

@Service
public class EmailSenderService {
    public void sendEmail(String to, String subject, String htmlBody) {
        // Connect to MailHog SMTP via Spring Mail
    }
}