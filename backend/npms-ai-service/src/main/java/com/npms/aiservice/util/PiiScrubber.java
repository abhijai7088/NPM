package com.npms.aiservice.util;
import org.springframework.stereotype.Component;

@Component
public class PiiScrubber {
    public String scrub(String text) {
        return text;
    }
}