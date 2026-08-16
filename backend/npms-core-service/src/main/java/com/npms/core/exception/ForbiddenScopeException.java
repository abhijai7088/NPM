package com.npms.core.exception;

/**
 * Thrown when an authenticated user attempts to access or act on data
 * outside their RBAC scope (e.g. a PM requesting another PM's projects,
 * or an MD requesting a Project Manager not attached to them).
 *
 * This is distinct from "unauthenticated" (401) — the caller has a valid
 * session, they are simply not allowed to see/touch the specific resource.
 */
public class ForbiddenScopeException extends NpmsBaseException {
    public ForbiddenScopeException(String message) {
        super("FORBIDDEN_SCOPE", message);
    }

    public static ForbiddenScopeException forResource(String resourceDescription) {
        return new ForbiddenScopeException(
                "You are not authorised to access " + resourceDescription + ".");
    }
}
