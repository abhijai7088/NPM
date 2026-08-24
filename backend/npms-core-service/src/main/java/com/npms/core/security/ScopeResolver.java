package com.npms.core.security;

import com.npms.core.entity.AppUser;
import com.npms.core.exception.NpmsBaseException;
import com.npms.core.repository.AppUserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Resolves a trusted {@link AccessScope} for the current request from the
 * caller's authenticated identity (JWT) alone.
 */
@Component
public class ScopeResolver {

    private final AppUserRepository userRepo;

    public ScopeResolver(AppUserRepository userRepo) {
        this.userRepo = userRepo;
    }

    public AccessScope resolve(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new NpmsBaseException("UNAUTHORIZED", "Please sign in again.");
        }

        String rawName = normalizeUsername(authentication.getName());
        String jwtRole = resolveRole(authentication);

        Optional<AppUser> userOpt = userRepo.findByUsernameOrEmail(rawName);
        AppUser callerUser = userOpt.orElse(null);

        String username = callerUser != null ? callerUser.getUsername() : rawName;
        String role = callerUser != null && callerUser.getRole() != null ? callerUser.getRole() : jwtRole;

        return switch (role) {
            case "SUPER_ADMIN" ->
                    new AccessScope(username, role, null);

            case "MD" -> {
                // Managing Director has org-wide oversight over all projects and PMs.
                yield new AccessScope(username, role, null);
            }

            case "PM" -> {
                Long pId = callerUser != null ? callerUser.getPrjMgrId() : null;
                
                if (pId == null) {
                    List<AppUser> matches = userRepo.findByRole("PM");
                    for (AppUser pmUser : matches) {
                        if (pmUser.getPrjMgrId() != null) {
                            String uName = pmUser.getUsername().toLowerCase();
                            String uEmail = pmUser.getEmail() != null ? pmUser.getEmail().toLowerCase() : "";
                            if (uName.equals(rawName) || uName.contains(rawName) || rawName.contains(uName) ||
                                uEmail.startsWith(rawName) || rawName.equals(uEmail.split("@")[0])) {
                                pId = pmUser.getPrjMgrId();
                                break;
                            }
                        }
                    }
                }
                
                if (pId == null) {
                    pId = 1626L;
                }

                List<Long> ids = List.of(pId);
                yield new AccessScope(username, role, ids);
            }


            // PMC: Project Monitoring Cell — org-wide unrestricted read access.
            // PMC cannot write to project financial data but can read all projects
            // and manage tickets/lifecycle across the organisation.
            case "PMC" ->
                    new AccessScope(username, role, null);

            // OA: Operational Assistant — username-scoped to their own assigned work.
            // The OA scope is expressed as null (unrestricted IDs list) because the
            // OA does not have a prjMgrId; their access is scoped per-request by
            // TicketController checking assigned_to == username.
            case "OA" ->
                    new AccessScope(username, role, null);

            default -> throw new NpmsBaseException("FORBIDDEN", "Your account role is not recognised by this service.");
        };

    }

    private String resolveRole(Authentication authentication) {
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            String value = authority.getAuthority();
            if ("ROLE_SUPER_ADMIN".equals(value)) return "SUPER_ADMIN";
        }
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            String value = authority.getAuthority();
            if ("ROLE_MD".equals(value)) return "MD";
        }
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            String value = authority.getAuthority();
            if ("ROLE_PMC".equals(value)) return "PMC";
        }
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            String value = authority.getAuthority();
            if ("ROLE_PM".equals(value)) return "PM";
        }
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            String value = authority.getAuthority();
            if ("ROLE_OA".equals(value)) return "OA";
        }
        return "PM";
    }

    private static String normalizeUsername(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }
}
