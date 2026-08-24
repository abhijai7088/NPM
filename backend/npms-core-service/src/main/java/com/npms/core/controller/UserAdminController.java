package com.npms.core.controller;

import com.npms.core.entity.AppUser;
import com.npms.core.entity.ProjectManager;
import com.npms.core.repository.AppUserRepository;
import com.npms.core.repository.ProjectManagerRepository;
import com.npms.core.service.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * User provisioning for the NPMS RBAC hierarchy.
 *
 * <p>{@code auth.users} is the authoritative identity store used by login and
 * password recovery. {@code nicsi_erp.app_user} stores NPMS-specific hierarchy
 * and Project Manager metadata. Every mutation updates both schemas in one
 * database transaction.</p>
 */
@RestController
@RequestMapping("/api/v1/users")
@CrossOrigin(origins = { "http://localhost:5195", "http://localhost:5190", "http://localhost:5173", "http://localhost:5174", "http://localhost:3000" })
public class UserAdminController {

    private static final Set<String> PROVISIONABLE_ROLES = Set.of("MD", "PM", "PMC", "OA");

    private static final String ACCOUNT_DIRECTORY_SQL = """
            WITH ranked_accounts AS (
                SELECT u.username,
                       u.full_name,
                       u.email,
                       r.code AS role,
                       u.is_active,
                       au.prj_mgr_id,
                       au.zone,
                       au.designation,
                       au.created_by,
                       au.managed_by,
                       COALESCE(au.created_at, CURRENT_TIMESTAMP) AS created_at,
                       ROW_NUMBER() OVER (
                           PARTITION BY u.username
                           ORDER BY CASE r.code
                               WHEN 'SUPER_ADMIN' THEN 1 WHEN 'MD' THEN 2 WHEN 'PMC' THEN 3 WHEN 'PM' THEN 4 WHEN 'OA' THEN 5 ELSE 6
                           END
                       ) AS role_rank
                FROM auth.users u
                JOIN auth.user_roles ur ON ur.user_id = u.id
                JOIN auth.roles r ON r.id = ur.role_id
                LEFT JOIN public.app_user au ON au.username = u.username
                WHERE r.code IN ('SUPER_ADMIN', 'MD', 'PM', 'PMC', 'OA')
                  AND COALESCE(u.is_deleted, FALSE) = FALSE
            )
            SELECT username, full_name, email, role, is_active, prj_mgr_id, zone,
                   designation, created_by, managed_by, created_at
            FROM ranked_accounts
            WHERE role_rank = 1
            ORDER BY created_at ASC NULLS LAST, username ASC
            """;


    private final AppUserRepository userRepo;
    private final ProjectManagerRepository pmRepo;
    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;

    public UserAdminController(AppUserRepository userRepo,
                               ProjectManagerRepository pmRepo,
                               JdbcTemplate jdbcTemplate,
                               AuditLogService auditLogService) {
        this.userRepo = userRepo;
        this.pmRepo = pmRepo;
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = new BCryptPasswordEncoder(12);
        this.auditLogService = auditLogService;
    }

    /** List authoritative login accounts, scoped to the acting officer. */
    @GetMapping
    public ResponseEntity<Map<String, Object>> listUsers(Authentication authentication) {

        Actor actor = actor(authentication);
        List<Map<String, Object>> accounts = loadAccounts();

        List<Map<String, Object>> visible;
        if ("MD".equals(actor.role())) {
            visible = accounts.stream()
                    .filter(account -> "PM".equals(account.get("role")))
                    .filter(account -> actor.username().equalsIgnoreCase(str(account.get("managedBy"))))
                    .collect(Collectors.toList());
        } else {
            visible = accounts;
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", visible,
                "total", visible.size()
        ));
    }

    /** Managing Directors used by the Super Admin's PM reporting-line selector. */
    @GetMapping("/mds")
    public ResponseEntity<Map<String, Object>> listManagingDirectors() {
        List<Map<String, Object>> mds = loadAccounts().stream()
                .filter(account -> "MD".equals(account.get("role")))
                .collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("success", true, "data", mds));
    }

    /** Available source-ERP Project Manager profiles. */
    @GetMapping("/pm-profiles")
    public ResponseEntity<Map<String, Object>> pmProfiles() {
        List<Map<String, Object>> profiles = pmRepo.findAll().stream().map(pm -> {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("prjMgrId", pm.getPrjMgrId());
            result.put("fullName", pm.getFullName());
            result.put("zone", pm.getZone());
            result.put("designation", pm.getDesignation());
            result.put("email", pm.getEmail());
            result.put("assigned", userRepo.existsByPrjMgrId(pm.getPrjMgrId()));
            return result;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(Map.of("success", true, "data", profiles));
    }

    /** Create an MD or PM account in both identity schemas atomically. */
    @PostMapping
    @Transactional
    public ResponseEntity<Map<String, Object>> createUser(
            @RequestBody Map<String, Object> body,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        Actor actor = actor(authentication);
        String actingRole = actor.role();
        String actingUser = actor.username();
        String role = upper(str(body.get("role")));
        String username = normalizeUsername(str(body.get("username")));
        String password = str(body.get("password"));
        String fullName = str(body.get("fullName")).trim();
        String email = str(body.get("email")).trim().toLowerCase(Locale.ROOT);
        String designation = str(body.get("designation")).trim();

        if (!hasRole(actingUser, actingRole)) {
            return forbidden("Your signed-in account is not authorised to provision users.");
        }
        if ("SUPER_ADMIN".equals(actingRole)) {
            if (!PROVISIONABLE_ROLES.contains(role)) {
                return bad("Super Admin may only create Managing Director, Project Manager, PMC, or OA accounts.");
            }
        } else if ("MD".equals(actingRole)) {
            if (!"PM".equals(role) && !"OA".equals(role)) {
                return bad("Managing Director may only create Project Manager or Operational Assistant accounts.");
            }
        } else {
            return forbidden("You are not authorised to provision users.");
        }

        if (username.isEmpty() || password.isEmpty() || fullName.isEmpty() || email.isEmpty()) {
            return bad("Username, password, full name and email are required.");
        }
        if (username.length() > 50) {
            return bad("Username must not exceed 50 characters.");
        }
        if (password.length() < 8) {
            return bad("Initial password must be at least 8 characters.");
        }

        AppUser legacyUser = userRepo.findById(username).orElse(null);
        boolean authUsernameExists = count(
                "SELECT COUNT(*) FROM auth.users WHERE lower(username) = lower(?)", username) > 0;
        if (authUsernameExists) {
            return bad("A user with this username already exists.");
        }
        if (legacyUser != null && !Boolean.TRUE.equals(legacyUser.getIsDeleted())) {
            return bad("A user with this username already exists.");
        }
        if (legacyUser != null) {
            // Remove a legacy soft-delete tombstone so this is a real re-provision.
            userRepo.delete(legacyUser);
            userRepo.flush();
        }

        long emailMatches = count("""
                SELECT (SELECT COUNT(*) FROM auth.users
                        WHERE lower(email) = lower(?) AND COALESCE(is_deleted, FALSE) = FALSE)
                     + (SELECT COUNT(*) FROM public.app_user
                        WHERE lower(email) = lower(?) AND COALESCE(is_deleted, FALSE) = FALSE)
                """, email, email);
        if (emailMatches > 0) {
            return bad("A user with this email address already exists.");
        }

        Long prjMgrId = null;
        String zone = str(body.get("zone")).trim();
        String managedBy = null;
        if ("PM".equals(role)) {
            try {
                prjMgrId = body.get("prjMgrId") == null || str(body.get("prjMgrId")).isBlank()
                        ? null : Long.valueOf(str(body.get("prjMgrId")));
            } catch (NumberFormatException ex) {
                return bad("Project Manager ID must be a valid number.");
            }
            if (prjMgrId == null) {
                return bad("A Project Manager must be assigned a Project Manager ID.");
            }
            ProjectManager pm = pmRepo.findById(prjMgrId).orElse(null);
            if (pm == null) {
                return bad("Selected Project Manager ID does not exist.");
            }
            if (userRepo.existsByPrjMgrId(prjMgrId)) {
                return bad("This Project Manager ID is already assigned to another PM login.");
            }

            if ("MD".equals(actingRole)) {
                managedBy = actingUser;
            } else {
                managedBy = normalizeUsername(str(body.get("managedBy")));
                if (managedBy.isEmpty()) {
                    return bad("Please select the Managing Director this Project Manager reports to.");
                }
                if (!hasRole(managedBy, "MD")) {
                    return bad("The selected Managing Director does not exist.");
                }
            }
            zone = pm.getZone();
            if (designation.isEmpty()) {
                designation = pm.getDesignation();
            }
        } else if ("OA".equals(role)) {
            if ("MD".equals(actingRole)) {
                managedBy = actingUser;
            } else {
                managedBy = normalizeUsername(str(body.get("managedBy")));
                if (managedBy.isEmpty()) managedBy = null;
            }
            if (designation.isEmpty()) designation = "Operational Assistant";
            if (zone.isEmpty()) zone = "HQ";
        } else if ("PMC".equals(role)) {
            if (designation.isEmpty()) designation = "Project Monitoring Cell";
            if (zone.isEmpty()) zone = "HQ";
        }


        UUID roleId = jdbcTemplate.queryForList(
                        "SELECT id FROM auth.roles WHERE code = ?", UUID.class, role)
                .stream().findFirst()
                .orElseThrow(() -> new IllegalStateException("Authentication role is not configured: " + role));

        String passwordHash = passwordEncoder.encode(password);
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO auth.users (
                    id, username, email, full_name, password_hash, is_active, is_locked,
                    failed_login_count, mfa_enabled, requires_password_change, is_deleted, version
                ) VALUES (?, ?, ?, ?, ?, TRUE, FALSE, 0, FALSE, TRUE, FALSE, 0)
                """, userId, username, email, fullName, passwordHash);
        jdbcTemplate.update(
                "INSERT INTO auth.user_roles (user_id, role_id) VALUES (?, ?)", userId, roleId);

        AppUser saved = userRepo.saveAndFlush(AppUser.builder()
                .username(username)
                .password(passwordHash)
                .fullName(fullName)
                .email(email)
                .role(role)
                .prjMgrId(prjMgrId)
                .designation(designation)
                .zone(zone)
                .createdBy(actingUser)
                .managedBy(managedBy)
                .isActive(true)
                .isDeleted(false)
                .createdAt(LocalDateTime.now())
                .build());

        Map<String, Object> savedDto = toDto(saved);
        auditLogService.writeLog(userId, actingUser, "USER_CREATED", "USER", userId,
                null, savedDto, clientIp(httpRequest), httpRequest.getHeader("User-Agent"),
                "SUCCESS", "Created " + roleLabel(role) + " account '" + username + "' for " + fullName);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", roleLabel(role) + " account created for " + fullName + ".",
                "data", savedDto
        ));
    }

    /** Activate or deactivate the authoritative login and its NPMS metadata. */
    @PatchMapping("/{username}/status")
    @Transactional
    public ResponseEntity<Map<String, Object>> toggleStatus(
            @PathVariable String username,
            @RequestBody Map<String, Object> body,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        String normalizedUsername = normalizeUsername(username);
        String role = findRole(normalizedUsername);
        if (role == null) {
            return bad("User not found.");
        }
        Actor actor = actor(authentication);
        if (!canManage(actor, normalizedUsername, role)) {
            return forbidden("You are not authorised to change this account.");
        }
        if ("SUPER_ADMIN".equals(role)) {
            return bad("The Super Admin account cannot be deactivated.");
        }

        Map<String, Object> before = findAccount(normalizedUsername);
        boolean active = body.get("isActive") != null
                && Boolean.parseBoolean(body.get("isActive").toString());
        int updated = jdbcTemplate.update(
                "UPDATE auth.users SET is_active = ?, updated_at = NOW() WHERE username = ?",
                active, normalizedUsername);
        if (updated != 1) {
            throw new IllegalStateException("Authoritative auth account was not updated for " + normalizedUsername);
        }
        jdbcTemplate.update(
                "UPDATE public.app_user SET is_active = ? WHERE username = ?",
                active, normalizedUsername);

        Map<String, Object> account = findAccount(normalizedUsername);
        UUID targetUserId = authUserId(normalizedUsername);
        auditLogService.writeLog(targetUserId, actor.username(),
                active ? "USER_ACTIVATED" : "USER_DEACTIVATED", "USER", targetUserId,
                before, account, clientIp(httpRequest), httpRequest.getHeader("User-Agent"),
                "SUCCESS", (active ? "Activated" : "Deactivated") + " account '" + normalizedUsername + "'");

        return ResponseEntity.ok(Map.of("success", true, "data", account));
    }

    /** Permanently delete the login and NPMS account in one transaction. */
    @DeleteMapping("/{username}")
    @Transactional
    public ResponseEntity<Map<String, Object>> deleteUser(
            @PathVariable String username,
            Authentication authentication,
            HttpServletRequest httpRequest) {
        String normalizedUsername = normalizeUsername(username);
        String role = findRole(normalizedUsername);
        AppUser appUser = userRepo.findById(normalizedUsername).orElse(null);
        if (role == null && appUser == null) {
            return bad("User not found.");
        }

        Actor actor = actor(authentication);
        String effectiveRole = role != null ? role : appUser.getRole();
        if (!canManage(actor, normalizedUsername, effectiveRole)) {
            return forbidden("You are not authorised to delete this account.");
        }
        if ("SUPER_ADMIN".equals(effectiveRole)) {
            return bad("The Super Admin account cannot be deleted.");
        }
        if ("MD".equals(effectiveRole) && count("""
                SELECT COUNT(*) FROM public.app_user
                WHERE role = 'PM' AND managed_by = ? AND COALESCE(is_deleted, FALSE) = FALSE
                """, normalizedUsername) > 0) {
            return bad("Reassign or delete this Managing Director's Project Managers before deleting the account.");
        }
        if (hasBusinessHistory(normalizedUsername)) {
            return bad("This account owns historical project or finance records and cannot be permanently deleted. Deactivate it instead.");
        }

        Map<String, Object> before = findAccount(normalizedUsername);
        UUID targetUserId = authUserId(normalizedUsername);

        jdbcTemplate.update("""
                DELETE FROM notification.notifications
                WHERE user_id IN (SELECT id FROM auth.users WHERE username = ?)
                """, normalizedUsername);
        int authDeleted = jdbcTemplate.update(
                "DELETE FROM auth.users WHERE username = ?", normalizedUsername);
        int appDeleted = jdbcTemplate.update(
                "DELETE FROM public.app_user WHERE username = ?", normalizedUsername);

        if (authDeleted == 0 && appDeleted == 0) {
            throw new IllegalStateException("No database account was deleted for " + normalizedUsername);
        }

        auditLogService.writeLog(targetUserId, actor.username(), "USER_DELETED", "USER", targetUserId,
                before, null, clientIp(httpRequest), httpRequest.getHeader("User-Agent"),
                "SUCCESS", "Permanently deleted " + roleLabel(effectiveRole) + " account '" + normalizedUsername + "'");

        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "User permanently deleted from NPMS and authentication records."
        ));
    }

    private List<Map<String, Object>> loadAccounts() {
        return jdbcTemplate.query(ACCOUNT_DIRECTORY_SQL, (rs, rowNum) -> {
            Map<String, Object> account = new LinkedHashMap<>();
            account.put("username", rs.getString("username"));
            account.put("fullName", rs.getString("full_name"));
            account.put("email", rs.getString("email"));
            account.put("role", rs.getString("role"));
            account.put("roleLabel", roleLabel(rs.getString("role")));
            account.put("prjMgrId", rs.getObject("prj_mgr_id"));
            account.put("zone", rs.getString("zone"));
            account.put("designation", rs.getString("designation"));
            account.put("createdBy", rs.getString("created_by"));
            account.put("managedBy", rs.getString("managed_by"));
            account.put("isActive", rs.getBoolean("is_active"));
            account.put("createdAt", rs.getObject("created_at"));
            return account;
        });
    }

    private Map<String, Object> findAccount(String username) {
        return loadAccounts().stream()
                .filter(account -> username.equalsIgnoreCase(str(account.get("username"))))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("User directory entry not found for " + username));
    }

    private String findRole(String username) {
        List<String> roles = jdbcTemplate.queryForList("""
                SELECT r.code
                FROM auth.users u
                JOIN auth.user_roles ur ON ur.user_id = u.id
                JOIN auth.roles r ON r.id = ur.role_id
                WHERE lower(u.username) = lower(?)
                  AND r.code IN ('SUPER_ADMIN', 'MD', 'PM')
                ORDER BY CASE r.code WHEN 'SUPER_ADMIN' THEN 1 WHEN 'MD' THEN 2 WHEN 'PM' THEN 3 END
                LIMIT 1
                """, String.class, username);
        if (!roles.isEmpty()) {
            return roles.get(0);
        }
        return userRepo.findById(username).map(AppUser::getRole).orElse(null);
    }

    private boolean hasRole(String username, String role) {
        if (username == null || username.isBlank() || role == null || role.isBlank()) {
            return false;
        }
        return count("""
                SELECT COUNT(*)
                FROM auth.users u
                JOIN auth.user_roles ur ON ur.user_id = u.id
                JOIN auth.roles r ON r.id = ur.role_id
                WHERE lower(u.username) = lower(?)
                  AND r.code = ?
                  AND u.is_active = TRUE
                  AND COALESCE(u.is_deleted, FALSE) = FALSE
                """, username, role) > 0;
    }

    private boolean hasBusinessHistory(String username) {
        Boolean operationalSchemaPresent = jdbcTemplate.queryForObject(
                "SELECT to_regclass('npms.projects') IS NOT NULL", Boolean.class);
        if (!Boolean.TRUE.equals(operationalSchemaPresent)) {
            return false;
        }
        return count("""
                SELECT
                    (SELECT COUNT(*) FROM npms.projects p
                     WHERE p.created_by = u.id OR p.approved_by = u.id) +
                    (SELECT COUNT(*) FROM npms.project_documents d WHERE d.uploaded_by = u.id) +
                    (SELECT COUNT(*) FROM npms.purchase_orders po
                     WHERE po.created_by = u.id OR po.approved_by = u.id) +
                    (SELECT COUNT(*) FROM npms.goods_receipts gr WHERE gr.received_by = u.id) +
                    (SELECT COUNT(*) FROM npms.invoices i
                     WHERE i.created_by = u.id OR i.approved_by = u.id) +
                    (SELECT COUNT(*) FROM npms.payments p WHERE p.initiated_by = u.id)
                FROM auth.users u
                WHERE u.username = ?
                """, username) > 0;
    }

    private boolean canManage(Actor actor, String targetUsername, String targetRole) {
        if ("SUPER_ADMIN".equals(actor.role())) {
            return true;
        }
        if (!"MD".equals(actor.role()) || !"PM".equals(targetRole)) {
            return false;
        }
        Map<String, Object> target = findAccount(targetUsername);
        return actor.username().equalsIgnoreCase(str(target.get("managedBy")));
    }

    private Actor actor(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new IllegalStateException("Authenticated actor is required");
        }
        String username = normalizeUsername(authentication.getName());
        Set<String> authorities = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority())
                .collect(Collectors.toSet());
        String role;
        if (authorities.contains("ROLE_SUPER_ADMIN")) {
            role = "SUPER_ADMIN";
        } else if (authorities.contains("ROLE_MD")) {
            role = "MD";
        } else {
            throw new IllegalStateException("Authenticated account cannot administer users");
        }
        return new Actor(username, role);
    }

    private record Actor(String username, String role) {}

    private long count(String sql, Object... args) {
        Long result = jdbcTemplate.queryForObject(sql, Long.class, args);
        return result == null ? 0 : result;
    }

    /** Resolves the authoritative auth.users UUID for an audit entity reference, if present. */
    private UUID authUserId(String username) {
        List<UUID> ids = jdbcTemplate.queryForList(
                "SELECT id FROM auth.users WHERE lower(username) = lower(?)", UUID.class, username);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** Prefers the X-Forwarded-For header (set by reverse proxies/gateways) over the raw socket address. */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private Map<String, Object> toDto(AppUser user) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("username", user.getUsername());
        result.put("fullName", user.getFullName());
        result.put("email", user.getEmail());
        result.put("role", user.getRole());
        result.put("roleLabel", roleLabel(user.getRole()));
        result.put("prjMgrId", user.getPrjMgrId());
        result.put("zone", user.getZone());
        result.put("designation", user.getDesignation());
        result.put("createdBy", user.getCreatedBy());
        result.put("managedBy", user.getManagedBy());
        result.put("isActive", user.getIsActive());
        result.put("createdAt", user.getCreatedAt());
        return result;
    }

    private static String roleLabel(String role) {
        if (role == null) return "";
        return switch (role) {
            case "SUPER_ADMIN" -> "Super Admin";
            case "MD" -> "Managing Director";
            case "PM" -> "Project Manager";
            default -> role;
        };
    }

    private static String normalizeUsername(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static String upper(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private static String str(Object value) {
        return value == null ? "" : value.toString();
    }

    private ResponseEntity<Map<String, Object>> bad(String message) {
        return ResponseEntity.badRequest().body(Map.of(
                "success", false, "error", "BAD_REQUEST", "message", message));
    }

    private ResponseEntity<Map<String, Object>> forbidden(String message) {
        return ResponseEntity.status(403).body(Map.of(
                "success", false, "error", "FORBIDDEN", "message", message));
    }
}
