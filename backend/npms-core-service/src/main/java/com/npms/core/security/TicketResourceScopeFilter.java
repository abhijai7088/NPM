package com.npms.core.security;

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
        String prefix = request.getContextPath() + "/api/v1/tickets";
        if (!path.startsWith(prefix)) {
            filterChain.doFilter(request, response);
            return;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            filterChain.doFilter(request, response);
            return;
        }

        AccessScope scope = scopeResolver.resolve(authentication);
        String relative = path.substring(prefix.length());

        if (relative.equals("/my-tasks") || relative.equals("/my-tasks/")) {
            if (!scope.isOa()) { deny(response, "OA personal task queue"); return; }
            filterChain.doFilter(request, response);
            return;
        }

        if (relative.equals("/overdue") || relative.equals("/overdue/") ||
            relative.equals("/escalated") || relative.equals("/escalated/") ||
            relative.equals("/priority-summary") || relative.equals("/priority-summary/")) {
            if (!scope.isMd() && !scope.isPmc() && !scope.isSuperAdmin()) {
                deny(response, "ticket monitoring endpoint");
                return;
            }
            filterChain.doFilter(request, response);
            return;
        }

        String[] parts = relative.split("/");
        if (parts.length >= 2 && isLong(parts[1])) {
            long ticketId = Long.parseLong(parts[1]);
            if (!hasTicketAccess(scope, ticketId)) {
                deny(response, "this ticket");
                return;
            }
        }

        if ("POST".equalsIgnoreCase(request.getMethod()) &&
            (relative.equals("") || relative.equals("/")) && scope.isOa()) {
            deny(response, "ticket creation");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean hasTicketAccess(AccessScope scope, long ticketId) {
        if (scope.isUnrestricted() || scope.isPmc()) return true;

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT t.assigned_to, p.prj_mgr_id " +
                "FROM public.project_ticket t " +
                "LEFT JOIN public.xx_nic_pm_prj_list p ON p.header_id = t.header_id " +
                "WHERE t.id = ? LIMIT 1", ticketId);

        if (rows.isEmpty()) return true; // controller returns canonical NOT_FOUND

        Map<String, Object> row = rows.get(0);
        String assignedTo = row.get("assigned_to") == null ? null : String.valueOf(row.get("assigned_to"));
        Long prjMgrId = row.get("prj_mgr_id") instanceof Number ? ((Number) row.get("prj_mgr_id")).longValue() : null;

        if (scope.isOa()) return assignedTo != null && scope.username().equalsIgnoreCase(assignedTo);

        if (scope.isPm() || scope.isMd()) {
            List<Long> allowed = scope.allowedPrjMgrIds();
            return prjMgrId != null && allowed != null && allowed.contains(prjMgrId);
        }
        return false;
    }

    private void deny(HttpServletResponse response, String resource) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType("application/json");
        response.getWriter().write("{\"success\":false,\"error\":\"FORBIDDEN_SCOPE\",\"message\":\"Access denied for " +
                resource.replace("\"", "'") + "\"}");
    }

    private boolean isLong(String value) {
        try { Long.parseLong(value); return true; }
        catch (NumberFormatException ex) { return false; }
    }
}
