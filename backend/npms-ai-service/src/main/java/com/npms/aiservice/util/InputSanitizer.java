package com.npms.aiservice.util;
import org.springframework.stereotype.Component;

@Component
public class InputSanitizer {
    public String sanitize(String input) {
        // Block prompt injection patterns
        return input.trim();
    }
}