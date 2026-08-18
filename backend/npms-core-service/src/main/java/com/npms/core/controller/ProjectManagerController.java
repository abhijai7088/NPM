package com.npms.core.controller;

import com.npms.core.entity.AppUser;
import com.npms.core.entity.ProjectManager;
import com.npms.core.exception.ForbiddenScopeException;
import com.npms.core.repository.AppUserRepository;
import com.npms.core.repository.ProjectListRepository;
import com.npms.core.repository.ProjectManagerRepository;
import com.npms.core.security.AccessScope;
import com.npms.core.security.ScopeResolver;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Exposes Project Manager portfolio aggregates for the MD / Super Admin
 * "Team Oversight" view.
 */
@RestController
@RequestMapping("/api/v1/project-managers")
@CrossOrigin(origins = { "http://localhost:5195", "http://localhost:5190", "http://localhost:5173", "http://localhost:5174", "http://localhost:3000" })
public class ProjectManagerController {

    private final ProjectManagerRepository pmRepo;
    private final ProjectListRepository projectRepo;
    private final AppUserRepository userRepo;
    private final ScopeResolver scopeResolver;
    private final JdbcTemplate jdbcTemplate;

    public ProjectManagerController(ProjectManagerRepository pmRepo,
                                    ProjectListRepository projectRepo,
                                    AppUserRepository userRepo,
                                    ScopeResolver scopeResolver,
                                    JdbcTemplate jdbcTemplate) {
        this.pmRepo = pmRepo;
        this.projectRepo = projectRepo;
        this.userRepo = userRepo;
        this.scopeResolver = scopeResolver;
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getAllProjectManagers(
            Authentication authentication,
            @RequestParam(required = false) String managedBy) {

        AccessScope scope = scopeResolver.resolve(authentication);
        if (scope.isPm()) {
            throw ForbiddenScopeException.forResource("the Team Oversight view");
        }

        List<AppUser> pmAccounts;
        if (scope.isMd()) {
            pmAccounts = userRepo.findByRoleAndManagedBy("PM", scope.username());
        } else if (managedBy != null && !managedBy.isEmpty()) {
            pmAccounts = userRepo.findByRoleAndManagedBy("PM", managedBy.trim().toLowerCase());
        } else {
            pmAccounts = userRepo.findByRole("PM");
        }

        Set<Long> provisionedIds = pmAccounts.stream()
                .map(AppUser::getPrjMgrId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        // Return ALL Project Managers from roster for complete organizational oversight
        List<ProjectManager> managers = pmRepo.findAll();

        // Query Project Types from xx_nic_pmdb_project_list
        Map<Long, List<String>> projectTypesMap = new HashMap<>();
        try {
            jdbcTemplate.query(
                "SELECT prj_mgr_id, prj_typ_description FROM public.xx_nic_pmdb_project_list WHERE prj_typ_description IS NOT NULL AND TRIM(prj_typ_description) <> ''",
                (rs) -> {
                    long id = rs.getLong("prj_mgr_id");
                    String desc = rs.getString("prj_typ_description");
                    projectTypesMap.computeIfAbsent(id, k -> new ArrayList<>()).add(desc);
                }
            );
        } catch (Exception e) {
            // fallback if view not ready
        }

        // Build a lookup of portfolio aggregates keyed by prj_mgr_id
        Map<Long, Object[]> aggByMgr = new HashMap<>();
        Object[] unassignedAgg = null;

        for (Object[] row : projectRepo.aggregatePortfolioByManager()) {
            if (row != null && row.length > 0) {
                if (row[0] != null) {
                    Long mgrId = ((Number) row[0]).longValue();
                    aggByMgr.put(mgrId, row);
                } else {
                    unassignedAgg = row;
                }
            }
        }

        BigDecimal orgReceived = BigDecimal.ZERO;
        BigDecimal orgCommission = BigDecimal.ZERO;
        BigDecimal orgPo = BigDecimal.ZERO;
        BigDecimal orgPending = BigDecimal.ZERO;
        long orgProjects = 0;

        List<Map<String, Object>> data = new ArrayList<>();
        for (ProjectManager pm : managers) {
            Object[] agg = aggByMgr.get(pm.getPrjMgrId());

            long projectCount = agg != null ? ((Number) agg[1]).longValue() : 0;
            BigDecimal totalReceived = agg != null ? toBig(agg[2]) : BigDecimal.ZERO;
            BigDecimal totalCommission = agg != null ? toBig(agg[3]) : BigDecimal.ZERO;
            BigDecimal totalPo = agg != null ? toBig(agg[4]) : BigDecimal.ZERO;
            BigDecimal totalPaid = agg != null ? toBig(agg[5]) : BigDecimal.ZERO;
            BigDecimal totalAbp = agg != null ? toBig(agg[6]) : BigDecimal.ZERO;
            BigDecimal totalVendorPending = agg != null ? toBig(agg[7]) : BigDecimal.ZERO;

            orgReceived = orgReceived.add(totalReceived);
            orgCommission = orgCommission.add(totalCommission);
            orgPo = orgPo.add(totalPo);
            orgPending = orgPending.add(totalVendorPending);
            orgProjects += projectCount;

            List<String> rawTypes = projectTypesMap.getOrDefault(pm.getPrjMgrId(), Collections.emptyList());
            List<String> distinctTypes = rawTypes.stream().distinct().collect(Collectors.toList());

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("prjMgrId", pm.getPrjMgrId());
            row.put("fullName", pm.getFullName());
            row.put("designation", pm.getDesignation());
            row.put("zone", pm.getZone());
            row.put("email", pm.getEmail());
            row.put("mobile", pm.getMobile());
            row.put("isActive", pm.getIsActive());
            row.put("isProvisioned", provisionedIds.contains(pm.getPrjMgrId()));
            row.put("projectCount", projectCount);
            row.put("totalReceived", totalReceived);
            row.put("totalCommission", totalCommission);
            row.put("totalPo", totalPo);
            row.put("totalPaid", totalPaid);
            row.put("totalAbp", totalAbp);
            row.put("totalVendorPending", totalVendorPending);
            row.put("projectTypes", distinctTypes);
            data.add(row);
        }

        Map<String, Object> unassignedPoolMap = null;
        if (unassignedAgg != null) {
            long projectCount = ((Number) unassignedAgg[1]).longValue();
            if (projectCount > 0) {
                BigDecimal totalReceived = toBig(unassignedAgg[2]);
                BigDecimal totalCommission = toBig(unassignedAgg[3]);
                BigDecimal totalPo = toBig(unassignedAgg[4]);
                BigDecimal totalPaid = toBig(unassignedAgg[5]);
                BigDecimal totalAbp = toBig(unassignedAgg[6]);
                BigDecimal totalVendorPending = toBig(unassignedAgg[7]);

                orgReceived = orgReceived.add(totalReceived);
                orgCommission = orgCommission.add(totalCommission);
                orgPo = orgPo.add(totalPo);
                orgPending = orgPending.add(totalVendorPending);
                orgProjects += projectCount;

                unassignedPoolMap = new LinkedHashMap<>();
                unassignedPoolMap.put("projectCount", projectCount);
                unassignedPoolMap.put("totalReceived", totalReceived);
                unassignedPoolMap.put("totalCommission", totalCommission);
                unassignedPoolMap.put("totalPo", totalPo);
                unassignedPoolMap.put("totalPaid", totalPaid);
                unassignedPoolMap.put("totalAbp", totalAbp);
                unassignedPoolMap.put("totalVendorPending", totalVendorPending);
            }
        }

        // Sort by project count and totalReceived descending
        data.sort((a, b) -> {
            int cmp = Long.compare(((Number) b.get("projectCount")).longValue(), ((Number) a.get("projectCount")).longValue());
            if (cmp != 0) return cmp;
            return toBig(b.get("totalReceived")).compareTo(toBig(a.get("totalReceived")));
        });

        Map<String, Object> org = new LinkedHashMap<>();
        org.put("totalManagers", managers.size());
        org.put("totalProjects", orgProjects);
        org.put("totalReceived", orgReceived);
        org.put("totalCommission", orgCommission);
        org.put("totalPo", orgPo);
        org.put("totalVendorPending", orgPending);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("success", true);
        resp.put("data", data);
        resp.put("org", org);
        resp.put("total", managers.size());
        if (unassignedPoolMap != null) {
            resp.put("unassignedPool", unassignedPoolMap);
        }

        return ResponseEntity.ok(resp);
    }


    @GetMapping("/{prjMgrId}")
    public ResponseEntity<Map<String, Object>> getProjectManager(
            Authentication authentication, @PathVariable Long prjMgrId) {
        AccessScope scope = scopeResolver.resolve(authentication);
        if (scope.isPm()) {
            throw ForbiddenScopeException.forResource("other Project Managers' profiles");
        }
        ProjectManager pm = pmRepo.findById(prjMgrId).orElse(null);
        if (pm == null) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Project manager not found"));
        }
        return ResponseEntity.ok(Map.of("success", true, "data", pm));
    }

    /**
     * GET /api/v1/project-managers/{prjMgrId}/projects
     *
     * Returns a compact list of projects for a given PM — used by the MD's
     * Ticket create form to populate the project ID dropdown dynamically.
     * Accessible by MD, PMC, and Super Admin (not PM or OA).
     */
    @GetMapping("/{prjMgrId}/projects")
    public ResponseEntity<Map<String, Object>> getProjectsForPm(
            Authentication authentication,
            @PathVariable Long prjMgrId) {

        AccessScope scope = scopeResolver.resolve(authentication);
        if (scope.isPm() || scope.isOa()) {
            throw ForbiddenScopeException.forResource("other Project Managers' project lists");
        }

        List<Map<String, Object>> projects = jdbcTemplate.queryForList(
            """
            SELECT header_id  AS "headerId",
                   project_cd AS "projectCode",
                   prj_nm     AS "projectName",
                   customer_name AS "customerName"
            FROM public.xx_nic_pm_prj_list
            WHERE prj_mgr_id = ?
            ORDER BY project_cd ASC
            """,
            prjMgrId
        );

        return ResponseEntity.ok(Map.of(
            "success", true,
            "prjMgrId", prjMgrId,
            "count", projects.size(),
            "data", projects
        ));
    }

    private static BigDecimal toBig(Object o) {
        if (o == null) return BigDecimal.ZERO;
        if (o instanceof BigDecimal b) return b;
        if (o instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
        return BigDecimal.ZERO;
    }
}

