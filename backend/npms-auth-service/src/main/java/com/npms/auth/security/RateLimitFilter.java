package com.npms.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * IP-based request throttle for the unauthenticated authentication endpoints
 * (login, forgot-password, verify-otp, resend-setup-otp). Every one of these
 * already has its own per-account/per-OTP defence (5 failed passwords locks
 * an account for 15 minutes; an OTP token is capped at 5 verification
 * attempts) — but neither of those stops an attacker from spraying guesses
 * across many different usernames or email addresses from the same source.
 * This filter closes that gap with a simple fixed-window counter in Redis,
 * shared across every auth-service instance.
 *
 * <p>Deliberately narrow in scope: only the auth endpoints listed in
 * {@link #isRateLimited} are throttled. Everything else (already-authenticated
 * routes) is unaffected — those are protected by requiring a valid JWT
 * instead.</p>
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);
    private static final String KEY_PREFIX = "npms:ratelimit:auth:";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${security.rate-limit.auth.max-requests:10}")
    private int maxRequests;

    @Value("${security.rate-limit.auth.window-seconds:300}")
    private long windowSeconds;

    public RateLimitFilter(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        if (!isRateLimited(request.getRequestURI())) {
            filterChain.doFilter(request, response);
            return;
        }

        String ip = clientIp(request);
        String key = KEY_PREFIX + request.getRequestURI() + ":" + ip;

        long count;
        try {
            count = redisTemplate.opsForValue().increment(key);
            if (count == 1L) {
                redisTemplate.expire(key, Duration.ofSeconds(windowSeconds));
            }
        } catch (Exception e) {
            // Redis being unreachable must never turn into an outage for login —
            // fail open (allow the request) but log loudly so it gets noticed.
            log.error("Rate limiter could not reach Redis; allowing request without throttling: {}", e.getMessage());
            filterChain.doFilter(request, response);
            return;
        }

        if (count > maxRequests) {
            log.warn("Rate limit exceeded for {} from {} ({} requests in {}s window)",
                    request.getRequestURI(), ip, count, windowSeconds);
            response.setStatus(429); // 429 Too Many Requests (not defined as a constant on HttpServletResponse)
            response.setContentType("application/json");
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", false);
            body.put("error", "RATE_LIMITED");
            body.put("message", "Too many attempts. Please wait a few minutes before trying again.");
            response.getWriter().write(objectMapper.writeValueAsString(body));
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean isRateLimited(String uri) {
        return uri.endsWith("/api/v1/auth/login")
                || uri.endsWith("/api/v1/auth/forgot-password")
                || uri.endsWith("/api/v1/auth/verify-otp")
                || uri.endsWith("/api/v1/auth/resend-setup-otp")
                || uri.endsWith("/api/v1/auth/mfa/verify");
    }

    /** Prefers X-Forwarded-For (set by a reverse proxy/gateway) over the raw socket address. */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
