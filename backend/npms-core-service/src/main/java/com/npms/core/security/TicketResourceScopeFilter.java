package com.npms.core.security;

import com.npms.core.exception.ForbiddenScopeException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.autoconfigure.security.SecurityProperties;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Map;

/**
 * Resource-level guard for ticket endpoints.
 * Controller-level role checks are not enough for a ticket id because a caller
 * could otherwise change the URL id and read or mutate another role's ticket.
 */
@Component
@Order(SecurityProperties.DEFAULT_FILTER_ORDER + 1)
public class TicketResourceScopeFilter extends OncePerRequestFilter {

    private final ScopeResolver scopeResolver;
    private final JdbcTemplate jdbcTemplate;

    public TicketResourceScopeFilter(ScopeResolver scopeResolver, JdbcTemplate jdbcTemplate) {
        this.scopeResolver = scopeResolver;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!path.startsWith(request.getContextPath() + "/api/v1/tickets")) {
            filterChain.doFilter(request, response);
            return;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            filterChain.doFilter(request, response);
            return;
        }

        AccessScope scope = scopeResolver.resolve(authentication);
        String relative = path.substring((request.getContextPath() + "/api/v1/tickets").length());

        // Personal queue is OA-only. It must never become a convenient org-wide endpoint.
        if (relative.equals("/my-tasks") || relative.equals("/my-tasks/")) {
            if (!scope.isOa()) throw ForbiddenScopeException.forResource("OA personal task queue");
            filterChain.doFilter(request, response);
            return;
        }

        // Organisation-wide exception endpoints are restricted to monitoring/management roles.
        if (relative.equals("/overdue") || relative.equals("/overdue/") ||
            relative.equals("/escalated") || relative.equals("/escalated/") ||
            relative.equals("/priority-summary") || relative.equals("/priority-summary/")) {
            if (!scope.isMd() && !scope.isPmc() && !scope.isSuperAdmin()) {
                throw ForbiddenScopeException.forResource("ticket monitoring endpoint");
            }
            filterChain.doFilter(request, response);
            return;
        }

        // Protect /{ticketId} and every action below it: /status, /assign, /events, etc.
        String[] parts = relative.split("/");
        if (parts.length >= 2 && isLong(parts[1])) {
            long ticketId = Long.parseLong(parts[1]);
            assertTicketAccess(scope, ticketId);
        }

        // OA cannot create a ticket; keep this server-side even if the frontend hides the action.
        if ("POST".equalsIgnoreCase(request.getMethod()) &&
            (relative.equals("") || relative.equals("/")) && scope.isOa()) {
            throw ForbiddenScopeException.forResource("ticket creation");
        }

        filterChain.doFilter(request, response);
    }

    private void assertTicketAccess(AccessScope scope, long ticketId) {
        if (scope.isUnrestricted() || scope.isPmc()) return;

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT t.header_id, t.assigned_to, p.prj_mgr_id " +
                "FROM public.project_ticket t " +
                "LEFT JOIN public.xx_nic_pm_prj_list p ON p.header_id = t.header_id " +
                "WHERE t.id = ? LIMIT 1", ticketId);

        if (rows.isEmpty()) {
            // Let the controller/service produce the canonical NOT_FOUND response.
            return;
        }

        Map<String, Object> row = rows.get(0);
        String assignedTo = row.get("assigned_to") == null ? null : String.valueOf(row.get("assigned_to"));
        Long prjMgrId = row.get("prj_mgr_id") instanceof Number
                ? ((Number) row.get("prj_mgr_id")).longValue() : null;

        if (scope.isOa()) {
            if (assignedTo == null || !scope.username().equalsIgnoreCase(assignedTo)) {
                throw ForbiddenScopeException.forResource("this ticket");
            }
            return;
        }

        if (scope.isPm() || scope.isMd()) {
            List<Long> allowed = scope.allowedPrjMgrIds();
            if (prjMgrId == null || allowed == null || !allowed.contains(prjMgrId)) {
                throw ForbiddenScopeException.forResource("this ticket's project");
            }
        }
    }

    private boolean isLong(String value) {
        try { Long.parseLong(value); return true; }
        catch (NumberFormatException ex) { return false; }
    }
}
