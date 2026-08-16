package com.npms.core.exception;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/**
 * Translates backend exceptions into the consistent
 * {@code { success, error, message }} JSON envelope used throughout NPMS,
 * so RBAC/scope violations never leak a raw stack trace or an
 * inconsistent error shape to the frontend.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** RBAC scope violations (e.g. a PM requesting another PM's data). */
    @ExceptionHandler(ForbiddenScopeException.class)
    public ResponseEntity<Map<String, Object>> handleForbiddenScope(ForbiddenScopeException ex) {
        log.warn("RBAC scope violation: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "success", false,
                "error", ex.getErrorCode(),
                "message", ex.getMessage()
        ));
    }

    /** Any other business-rule exception raised via NpmsBaseException. */
    @ExceptionHandler(NpmsBaseException.class)
    public ResponseEntity<Map<String, Object>> handleBusinessException(NpmsBaseException ex) {
        log.warn("Business rule exception: {} - {}", ex.getErrorCode(), ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                "success", false,
                "error", ex.getErrorCode(),
                "message", ex.getMessage()
        ));
    }

    /** Spring Security method-level denials (e.g. @PreAuthorize failures). */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
                "success", false,
                "error", "FORBIDDEN",
                "message", "You are not authorised to perform this action."
        ));
    }

    /** Missing/invalid authentication (should be rare — the filter chain normally handles this). */
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, Object>> handleAuthentication(AuthenticationException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                "success", false,
                "error", "UNAUTHORIZED",
                "message", "Please sign in again."
        ));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalState(IllegalStateException ex) {
        log.error("Illegal state", ex);
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                "success", false,
                "error", "CONFLICT",
                "message", ex.getMessage()
        ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAll(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "success", false,
                "error", "INTERNAL_ERROR",
                "message", "An unexpected error occurred."
        ));
    }
}
