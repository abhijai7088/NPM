package com.npms.core.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.autoconfigure.security.SecurityProperties;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Resource-level guard for ticket endpoints.
 * Controller-level role checks are not enough for a ticket id or project id:
 * callers must not widen their scope by changing URL/body identifiers.
 */
@Component
@Order(SecurityProperties.DEFAULT_FILTER_ORDER + 1)
public class TicketResourceScopeFilter extends OncePerRequestFilter {

    private final ScopeResolver scopeResolver;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

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

        // POST /tickets creates a resource inside a project. Validate that project
        // against the server-derived PM scope before allowing the controller to run.
        if ("POST".equalsIgnoreCase(request.getMethod()) && (relative.equals("") || relative.equals("/"))) {
            if (scope.isOa()) { deny(response, "ticket creation"); return; }
            if (scope.isPmc() || scope.isUnrestricted()) {
                filterChain.doFilter(request, response);
                return;
            }

            byte[] body = request.getInputStream().readAllBytes();
            JsonNode json;
            try {
                json = body.length == 0 ? objectMapper.createObjectNode() : objectMapper.readTree(body);
            } catch (Exception ex) {
                deny(response, "invalid ticket request");
                return;
            }
            JsonNode headerIdNode = json.get("headerId");
            if (headerIdNode != null && !headerIdNode.isNull()) {
                try {
                    long headerId = headerIdNode.asLong();
                    if (!hasProjectAccess(scope, headerId)) {
                        deny(response, "this project's ticket scope");
                        return;
                    }
                } catch (Exception ex) {
                    deny(response, "invalid project scope");
                    return;
                }
            }
            filterChain.doFilter(new CachedBodyRequest(request, body), response);
            return;
        }

        // Protect /{ticketId} and every action below it: /status, /assign, /events, etc.
        String[] parts = relative.split("/");
        if (parts.length >= 2 && isLong(parts[1])) {
            long ticketId = Long.parseLong(parts[1]);
            if (!hasTicketAccess(scope, ticketId)) {
                deny(response, "this ticket");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean hasProjectAccess(AccessScope scope, long headerId) {
        if (scope.isUnrestricted() || scope.isPmc()) return true;
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT prj_mgr_id FROM public.xx_nic_pm_prj_list WHERE header_id = ? LIMIT 1", headerId);
        if (rows.isEmpty()) return false;
        Object value = rows.get(0).get("prj_mgr_id");
        if (!(value instanceof Number)) return false;
        long prjMgrId = ((Number) value).longValue();
        List<Long> allowed = scope.allowedPrjMgrIds();
        return allowed != null && allowed.contains(prjMgrId);
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
        response.getWriter().write("{\"success\":false,\"error\":\"FORBIDDEN_SCOPE\",\"message\":\"Access denied for " + resource.replace("\"", "'") + "\"}");
    }

    private boolean isLong(String value) {
        try { Long.parseLong(value); return true; }
        catch (NumberFormatException ex) { return false; }
    }

    private static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;
        CachedBodyRequest(HttpServletRequest request, byte[] body) { super(request); this.body = body; }
        @Override public ServletInputStream getInputStream() {
            ByteArrayInputStream input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public boolean isFinished() { return input.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) { }
            };
        }
        @Override public BufferedReader getReader() { return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8)); }
    }
}
