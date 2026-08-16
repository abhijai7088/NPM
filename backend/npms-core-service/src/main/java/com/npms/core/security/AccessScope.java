package com.npms.core.security;

import com.npms.core.exception.ForbiddenScopeException;

import java.util.List;
import java.util.Objects;

/**
 * The resolved, server-trusted data-access scope for the currently
 * authenticated request. This is derived entirely from the caller's JWT
 * identity (see {@link ScopeResolver}) — it never trusts a client-supplied
 * {@code prjMgrId} / {@code managedBy} query parameter as the source of
 * truth. Controllers use this to build repository/specification queries
 * and to validate any resource-specific id the caller asks for.
 *
 * <h2>How this scales beyond one PM</h2>
 * <ul>
 *   <li>{@code SUPER_ADMIN} — {@link #allowedPrjMgrIds()} is {@code null},
 *       meaning "no restriction, see everything." This never changes as
 *       PMs are added.</li>
 *   <li>{@code MD} — {@link #allowedPrjMgrIds()} is the live list of
 *       {@code prj_mgr_id} values for every PM currently provisioned with
 *       {@code managed_by = <this MD's username>}. Today that list has one
 *       entry (Atul Rastogi / 1626); the moment a second PM is provisioned
 *       under the same MD, this list grows automatically — no code change
 *       required, because it is computed fresh from the database on every
 *       request via {@link com.npms.core.repository.AppUserRepository}.</li>
 *   <li>{@code PM} — {@link #allowedPrjMgrIds()} is always exactly one
 *       element: the PM's own {@code prj_mgr_id}, resolved server-side from
 *       their {@code app_user} row (looked up by the authenticated
 *       username) — never from anything the client sends.</li>
 * </ul>
 */
public final class AccessScope {

    private final String username;
    private final String role;
    /** Null means unrestricted (Super Admin only). Otherwise the exact set of prjMgrIds this caller may see. */
    private final List<Long> allowedPrjMgrIds;

    AccessScope(String username, String role, List<Long> allowedPrjMgrIds) {
        this.username = username;
        this.role = role;
        this.allowedPrjMgrIds = allowedPrjMgrIds;
    }

    public String username() {
        return username;
    }

    public String role() {
        return role;
    }

    public boolean isSuperAdmin() {
        return "SUPER_ADMIN".equals(role);
    }

    public boolean isMd() {
        return "MD".equals(role);
    }

    public boolean isPm() {
        return "PM".equals(role);
    }

    /**
     * @return {@code null} if the caller is unrestricted (Super Admin); otherwise the
     *         exact, server-resolved set of {@code prjMgrId} values the caller may see.
     *         An empty (non-null) list means the caller is restricted but currently has
     *         zero accessible PMs (e.g. an MD who hasn't provisioned any PM yet).
     */
    public List<Long> allowedPrjMgrIds() {
        return allowedPrjMgrIds;
    }

    /** True if this caller is allowed to see everything (no scope restriction at all). */
    public boolean isUnrestricted() {
        return allowedPrjMgrIds == null;
    }

    /**
     * Validates that a specific {@code prjMgrId} the caller is requesting (e.g. via
     * {@code ?prjMgrId=1626} to drill into one PM's projects) actually falls within
     * this caller's resolved scope. Super Admin always passes. Throws otherwise.
     */
    public void requirePrjMgrId(Long requestedPrjMgrId) {
        if (isUnrestricted()) {
            return;
        }
        if (requestedPrjMgrId == null || !allowedPrjMgrIds.contains(requestedPrjMgrId)) {
            throw ForbiddenScopeException.forResource("this Project Manager's data");
        }
    }

    /**
     * Validates that a specific MD username the caller is requesting data "managed by"
     * is actually themself. Only meaningful for MD callers; Super Admin always passes.
     */
    public void requireOwnUsername(String requestedUsername) {
        if (isUnrestricted()) {
            return;
        }
        if (requestedUsername == null || !username.equalsIgnoreCase(requestedUsername)) {
            throw ForbiddenScopeException.forResource("another user's managed portfolio");
        }
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof AccessScope other)) return false;
        return Objects.equals(username, other.username) && Objects.equals(role, other.role);
    }

    @Override
    public int hashCode() {
        return Objects.hash(username, role);
    }
}
