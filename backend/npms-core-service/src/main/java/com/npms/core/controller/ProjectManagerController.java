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

        // Query Project Types AND counts from xx_nic_pmdb_project_list
        // projectTypesMap: prjMgrId -> list of "TypeName (N)" strings
        // projectCountMap: prjMgrId -> SUM(noofproject) — the authoritative count
        Map<Long, List<String>> projectTypesMap = new HashMap<>();
        Map<Long, Long> projectCountFromPmdb = new HashMap<>();
        Map<Long, List<Map<String, Object>>> projectTypeDetailsMap = new HashMap<>();
        try {
            jdbcTemplate.query(
                "SELECT prj_mgr_id, prj_typ_description, noofproject FROM public.xx_nic_pmdb_project_list WHERE prj_typ_description IS NOT NULL AND TRIM(prj_typ_description) <> '' ORDER BY prj_mgr_id, noofproject DESC",
                (rs) -> {
                    long id = rs.getLong("prj_mgr_id");
                    String desc = rs.getString("prj_typ_description");
                    long cnt = rs.getLong("noofproject");
                    // Accumulate SUM
                    projectCountFromPmdb.merge(id, cnt, Long::sum);
                    // Type label
                    projectTypesMap.computeIfAbsent(id, k -> new ArrayList<>()).add(desc);
                    // Full detail {type, count}
                    Map<String, Object> detail = new LinkedHashMap<>();
                    detail.put("type", desc);
                    detail.put("count", cnt);
                    projectTypeDetailsMap.computeIfAbsent(id, k -> new ArrayList<>()).add(detail);
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

        // Build lookup of AppUser accounts by prj_mgr_id
        Map<Long, AppUser> pmUserMap = userRepo.findByRole("PM").stream()
                .filter(u -> u.getPrjMgrId() != null)
                .collect(Collectors.toMap(AppUser::getPrjMgrId, u -> u, (existing, replacement) -> existing));

        List<Map<String, Object>> data = new ArrayList<>();
        for (ProjectManager pm : managers) {
            Object[] agg = aggByMgr.get(pm.getPrjMgrId());

            // Use pmdb count (SUM of noofproject) as authoritative; fall back to project_list count
            long pmdbCount = projectCountFromPmdb.getOrDefault(pm.getPrjMgrId(), 0L);
            long listCount = agg != null ? ((Number) agg[1]).longValue() : 0;
            long projectCount = pmdbCount > 0 ? pmdbCount : listCount;
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
            List<Map<String, Object>> typeDetails = projectTypeDetailsMap.getOrDefault(pm.getPrjMgrId(), Collections.emptyList());

            AppUser appUser = pmUserMap.get(pm.getPrjMgrId());
            String username = appUser != null ? appUser.getUsername() : (pm.getEmail() != null ? pm.getEmail().split("@")[0].replace(".", "_").toLowerCase() : "pm_" + pm.getPrjMgrId());
            String managedByVal = appUser != null ? appUser.getManagedBy() : "md.alok_tiwari";

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("prjMgrId", pm.getPrjMgrId());
            row.put("username", username);
            row.put("managedBy", managedByVal);
            row.put("fullName", pm.getFullName());
            row.put("designation", pm.getDesignation());
            row.put("zone", pm.getZone());
            row.put("email", pm.getEmail());
            row.put("mobile", pm.getMobile());
            row.put("isActive", pm.getIsActive());
            row.put("isProvisioned", provisionedIds.contains(pm.getPrjMgrId()) || appUser != null);
            row.put("projectCount", projectCount);
            row.put("projectCountList", listCount);   // actual project rows in project_list
            row.put("totalReceived", totalReceived);
            row.put("totalCommission", totalCommission);
            row.put("totalPo", totalPo);
            row.put("totalPaid", totalPaid);
            row.put("totalAbp", totalAbp);
            row.put("totalVendorPending", totalVendorPending);
            row.put("projectTypes", distinctTypes);
            row.put("projectTypeDetails", typeDetails);  // [{type, count}, ...]
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

    /**
     * GET /api/v1/project-managers/{prjMgrId}/project-types
     *
     * Returns project type breakdown (type name + count) for a specific PM
     * from xx_nic_pmdb_project_list. Used for the MD drill-down type selection view.
     */
    @GetMapping("/{prjMgrId}/project-types")
    public ResponseEntity<Map<String, Object>> getProjectTypesForPm(
            Authentication authentication, @PathVariable Long prjMgrId) {
        AccessScope scope = scopeResolver.resolve(authentication);
        if (scope.isPm()) {
            throw ForbiddenScopeException.forResource("other Project Managers' type details");
        }

        // Get PM profile
        ProjectManager pm = pmRepo.findById(prjMgrId).orElse(null);
        if (pm == null) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Project manager not found"));
        }

        // Query detailed project record counts from xx_nic_pm_prj_list
        Map<String, Long> detailedCounts = new HashMap<>();
        long totalDetailedRecords = 0;
        try {
            List<Map<String, Object>> dRows = jdbcTemplate.queryForList(
                "SELECT prj_type, count(*) as cnt FROM public.xx_nic_pm_prj_list WHERE prj_mgr_id = ? GROUP BY prj_type",
                prjMgrId
            );
            for (Map<String, Object> dr : dRows) {
                String code = (String) dr.get("prj_type");
                long cnt = ((Number) dr.get("cnt")).longValue();
                if (code != null) detailedCounts.put(code.trim().toUpperCase(), cnt);
                totalDetailedRecords += cnt;
            }
        } catch (Exception ignored) {}

        // Query type breakdown from authoritative pmdb table
        List<Map<String, Object>> types = new ArrayList<>();
        long totalProjects = 0;
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT prj_typ_description as type, prj_typ_code as code, noofproject as count " +
                "FROM public.xx_nic_pmdb_project_list " +
                "WHERE prj_mgr_id = ? AND prj_typ_description IS NOT NULL AND TRIM(prj_typ_description) <> '' " +
                "ORDER BY noofproject DESC",
                prjMgrId
            );
            for (Map<String, Object> row : rows) {
                String code = (String) row.get("code");
                long summaryCount = ((Number) row.get("count")).longValue();
                long detailedCount = detailedCounts.getOrDefault(code != null ? code.trim().toUpperCase() : "", 0L);

                Map<String, Object> typeItem = new LinkedHashMap<>(row);
                typeItem.put("summaryCount", summaryCount);
                typeItem.put("detailedCount", detailedCount);
                types.add(typeItem);
                totalProjects += summaryCount;
            }
        } catch (Exception e) {
            // fallback empty
        }

        Map<String, Object> pmInfo = new LinkedHashMap<>();
        pmInfo.put("prjMgrId", pm.getPrjMgrId());
        pmInfo.put("fullName", pm.getFullName());
        pmInfo.put("designation", pm.getDesignation());
        pmInfo.put("zone", pm.getZone());
        pmInfo.put("email", pm.getEmail());

        return ResponseEntity.ok(Map.of(
            "success", true,
            "pmInfo", pmInfo,
            "totalProjects", totalProjects,
            "totalDetailedRecords", totalDetailedRecords,
            "projectTypes", types
        ));
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

