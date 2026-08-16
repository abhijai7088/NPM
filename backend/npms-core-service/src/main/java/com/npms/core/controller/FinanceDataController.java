package com.npms.core.controller;

import com.npms.core.entity.AppUser;
import com.npms.core.entity.BillDeskList;
import com.npms.core.entity.PurchaseOrderList;
import com.npms.core.entity.TaxInvoiceList;
import com.npms.core.exception.ForbiddenScopeException;
import com.npms.core.repository.AppUserRepository;
import com.npms.core.repository.BillDeskListRepository;
import com.npms.core.repository.PurchaseOrderListRepository;
import com.npms.core.repository.TaxInvoiceListRepository;
import com.npms.core.security.AccessScope;
import com.npms.core.security.ScopeResolver;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * REST controller for finance-related data endpoints.
 * Provides access to PO List, BillDesk Invoices, and Tax Invoices.
 *
 * <p><b>Scoping is server-trusted.</b> {@link ScopeResolver} derives the
 * caller's real access scope from their authenticated JWT identity. The
 * legacy {@code prjMgrId}/{@code managedBy}/{@code provisionedOnly} query
 * parameters are still accepted, but only ever used to let an already-
 * unrestricted caller (Super Admin) or an already-scoped caller (MD
 * drilling into one of their own PMs) narrow their own view — never to
 * widen it. See {@link com.npms.core.security.AccessScope}.</p>
 */
@RestController
@RequestMapping("/api/v1/finance")
@CrossOrigin(origins = { "http://localhost:5195", "http://localhost:5190", "http://localhost:5173", "http://localhost:5174", "http://localhost:3000" })
public class FinanceDataController {

    private final PurchaseOrderListRepository poRepo;
    private final BillDeskListRepository billDeskRepo;
    private final TaxInvoiceListRepository taxInvRepo;
    private final AppUserRepository userRepo;
    private final ScopeResolver scopeResolver;

    public FinanceDataController(
            PurchaseOrderListRepository poRepo,
            BillDeskListRepository billDeskRepo,
            TaxInvoiceListRepository taxInvRepo,
            AppUserRepository userRepo,
            ScopeResolver scopeResolver) {
        this.poRepo = poRepo;
        this.billDeskRepo = billDeskRepo;
        this.taxInvRepo = taxInvRepo;
        this.userRepo = userRepo;
        this.scopeResolver = scopeResolver;
    }

    /**
     * Resolves the exact set of prjMgrIds a finance list query may return,
     * honoring an optional drill-down (single {@code prjMgrId}, or a
     * Super-Admin-only {@code managedBy}/{@code provisionedOnly} filter)
     * without ever letting it exceed the caller's real, server-resolved scope.
     *
     * @return a two-element result: [0] = the id list to filter by (null = unrestricted,
     *         empty = restricted with zero visible PMs), [1] = an optional single
     *         prjMgrId drill-down (only ever set for MD/Super Admin; a PM's own id
     *         is already covered by the id list).
     */
    private ScopedIds resolveScopedIds(AccessScope scope, Long prjMgrId, Boolean provisionedOnly, String managedBy) {
        if (scope.isPm()) {
            return new ScopedIds(scope.allowedPrjMgrIds(), null);
        }
        if (scope.isMd()) {
            if (prjMgrId != null) {
                scope.requirePrjMgrId(prjMgrId);
                return new ScopedIds(null, prjMgrId);
            }
            return new ScopedIds(scope.allowedPrjMgrIds(), null);
        }
        // SUPER_ADMIN: unrestricted unless they deliberately ask to narrow.
        if (managedBy != null && !managedBy.isEmpty()) {
            return new ScopedIds(scopedPmIds(managedBy), null);
        }
        if (Boolean.TRUE.equals(provisionedOnly)) {
            return new ScopedIds(scopedPmIds(null), null);
        }
        return new ScopedIds(null, prjMgrId);
    }

    private record ScopedIds(List<Long> ids, Long singlePrjMgrId) {}

    /**
     * The PM ids to scope a finance query to.
     * @param managedBy  if non-blank, only PMs attached to this Managing Director;
     *                   otherwise all provisioned PMs.
     */
    private List<Long> scopedPmIds(String managedBy) {
        List<AppUser> pms = (managedBy != null && !managedBy.isEmpty())
                ? userRepo.findByRoleAndManagedBy("PM", managedBy.trim().toLowerCase())
                : userRepo.findByRole("PM");
        return pms.stream()
                .map(AppUser::getPrjMgrId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
    }

    /** Validates a project-scoped lookup (by projectNo) against the caller's scope. */
    private void requireProjectInScope(AccessScope scope, Long resultPrjMgrId) {
        if (scope.isUnrestricted()) {
            return;
        }
        if (resultPrjMgrId == null || !scope.allowedPrjMgrIds().contains(resultPrjMgrId)) {
            throw ForbiddenScopeException.forResource("this project's finance records");
        }
    }

    // ─── Purchase Orders ────────────────────────────────────────────────

    @GetMapping("/purchase-orders")
    public ResponseEntity<Map<String, Object>> getAllPurchaseOrders(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long prjMgrId,
            @RequestParam(required = false) Boolean provisionedOnly,
            @RequestParam(required = false) String managedBy) {

        AccessScope scope = scopeResolver.resolve(authentication);
        ScopedIds scoped = resolveScopedIds(scope, prjMgrId, provisionedOnly, managedBy);

        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "poDate"));
        boolean hasSearch = search != null && !search.isEmpty();

        Page<PurchaseOrderList> result;
        if (scoped.ids() != null) {
            List<Long> ids = scoped.ids();
            if (ids.isEmpty()) {
                result = Page.empty(pageable);
            } else if (hasSearch) {
                result = poRepo.findByPrjMgrIdInAndProjectNoContainingIgnoreCase(ids, search, pageable);
            } else {
                result = poRepo.findByPrjMgrIdIn(ids, pageable);
            }
        } else if (scoped.singlePrjMgrId() != null && hasSearch) {
            result = poRepo.findByPrjMgrIdAndProjectNoContainingIgnoreCase(scoped.singlePrjMgrId(), search, pageable);
        } else if (scoped.singlePrjMgrId() != null) {
            result = poRepo.findByPrjMgrId(scoped.singlePrjMgrId(), pageable);
        } else if (hasSearch) {
            result = poRepo.findByProjectNoContainingIgnoreCase(search, pageable);
        } else {
            result = poRepo.findAll(pageable);
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", result.getContent(),
                "total", result.getTotalElements(),
                "pages", result.getTotalPages(),
                "page", page
        ));
    }

    @GetMapping("/purchase-orders/by-project/{projectNo}")
    public ResponseEntity<Map<String, Object>> getPurchaseOrdersByProject(
            Authentication authentication, @PathVariable String projectNo) {
        AccessScope scope = scopeResolver.resolve(authentication);
        List<PurchaseOrderList> pos = poRepo.findByProjectNo(projectNo);
        if (!scope.isUnrestricted() && !pos.isEmpty()) {
            requireProjectInScope(scope, pos.get(0).getPrjMgrId());
        }
        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", pos,
                "total", pos.size()
        ));
    }

    @GetMapping("/purchase-orders/expired")
    public ResponseEntity<Map<String, Object>> getExpiredProjects(Authentication authentication) {
        AccessScope scope = scopeResolver.resolve(authentication);
        List<String> expired = poRepo.findExpiredProjectCodes(LocalDate.now());
        if (!scope.isUnrestricted()) {
            expired = filterProjectCodesByScope(expired, scope);
        }
        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", expired,
                "total", expired.size()
        ));
    }

    @GetMapping("/purchase-orders/expiring-soon")
    public ResponseEntity<Map<String, Object>> getExpiringSoonProjects(
            Authentication authentication,
            @RequestParam(defaultValue = "30") int days) {
        AccessScope scope = scopeResolver.resolve(authentication);
        LocalDate today = LocalDate.now();
        List<String> expiring = poRepo.findExpiringSoonProjectCodes(today, today.plusDays(days));
        if (!scope.isUnrestricted()) {
            expiring = filterProjectCodesByScope(expiring, scope);
        }
        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", expiring,
                "total", expiring.size()
        ));
    }

    /** Filters a list of project codes down to only those owned by a PM within scope. */
    private List<String> filterProjectCodesByScope(List<String> projectCodes, AccessScope scope) {
        if (projectCodes.isEmpty() || scope.allowedPrjMgrIds().isEmpty()) {
            return List.of();
        }
        return projectCodes.stream()
                .filter(code -> {
                    List<PurchaseOrderList> pos = poRepo.findByProjectNo(code);
                    return !pos.isEmpty() && pos.get(0).getPrjMgrId() != null
                            && scope.allowedPrjMgrIds().contains(pos.get(0).getPrjMgrId());
                })
                .collect(Collectors.toList());
    }

    // ─── BillDesk Invoices ──────────────────────────────────────────────

    @GetMapping("/bill-desk")
    public ResponseEntity<Map<String, Object>> getAllBillDeskInvoices(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long prjMgrId,
            @RequestParam(required = false) Boolean provisionedOnly,
            @RequestParam(required = false) String managedBy) {

        AccessScope scope = scopeResolver.resolve(authentication);
        ScopedIds scoped = resolveScopedIds(scope, prjMgrId, provisionedOnly, managedBy);

        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "invoiceDate"));
        boolean hasSearch = search != null && !search.isEmpty();

        Page<BillDeskList> result;
        if (scoped.ids() != null) {
            List<Long> ids = scoped.ids();
            if (ids.isEmpty()) {
                result = Page.empty(pageable);
            } else if (hasSearch) {
                result = billDeskRepo.findByPrjMgrIdInAndProjectNoContainingIgnoreCase(ids, search, pageable);
            } else {
                result = billDeskRepo.findByPrjMgrIdIn(ids, pageable);
            }
        } else if (scoped.singlePrjMgrId() != null && hasSearch) {
            result = billDeskRepo.findByPrjMgrIdAndProjectNoContainingIgnoreCase(scoped.singlePrjMgrId(), search, pageable);
        } else if (scoped.singlePrjMgrId() != null) {
            result = billDeskRepo.findByPrjMgrId(scoped.singlePrjMgrId(), pageable);
        } else if (hasSearch) {
            result = billDeskRepo.findByProjectNoContainingIgnoreCase(search, pageable);
        } else {
            result = billDeskRepo.findAll(pageable);
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", result.getContent(),
                "total", result.getTotalElements(),
                "pages", result.getTotalPages(),
                "page", page
        ));
    }

    @GetMapping("/bill-desk/by-project/{projectNo}")
    public ResponseEntity<Map<String, Object>> getBillDeskByProject(
            Authentication authentication, @PathVariable String projectNo) {
        AccessScope scope = scopeResolver.resolve(authentication);
        List<BillDeskList> bills = billDeskRepo.findByProjectNo(projectNo);
        if (!scope.isUnrestricted() && !bills.isEmpty()) {
            requireProjectInScope(scope, bills.get(0).getPrjMgrId());
        }
        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", bills,
                "total", bills.size()
        ));
    }

    // ─── Tax Invoices ───────────────────────────────────────────────────

    @GetMapping("/tax-invoices")
    public ResponseEntity<Map<String, Object>> getAllTaxInvoices(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long prjMgrId,
            @RequestParam(required = false) Boolean provisionedOnly,
            @RequestParam(required = false) String managedBy) {

        AccessScope scope = scopeResolver.resolve(authentication);
        ScopedIds scoped = resolveScopedIds(scope, prjMgrId, provisionedOnly, managedBy);

        PageRequest pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "billDate"));
        boolean hasSearch = search != null && !search.isEmpty();

        Page<TaxInvoiceList> result;
        if (scoped.ids() != null) {
            List<Long> ids = scoped.ids();
            if (ids.isEmpty()) {
                result = Page.empty(pageable);
            } else if (hasSearch) {
                result = taxInvRepo.findByPrjMgrIdInAndProjectNoContainingIgnoreCase(ids, search, pageable);
            } else {
                result = taxInvRepo.findByPrjMgrIdIn(ids, pageable);
            }
        } else if (scoped.singlePrjMgrId() != null && hasSearch) {
            result = taxInvRepo.findByPrjMgrIdAndProjectNoContainingIgnoreCase(scoped.singlePrjMgrId(), search, pageable);
        } else if (scoped.singlePrjMgrId() != null) {
            result = taxInvRepo.findByPrjMgrId(scoped.singlePrjMgrId(), pageable);
        } else if (hasSearch) {
            result = taxInvRepo.findByProjectNoContainingIgnoreCase(search, pageable);
        } else {
            result = taxInvRepo.findAll(pageable);
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", result.getContent(),
                "total", result.getTotalElements(),
                "pages", result.getTotalPages(),
                "page", page
        ));
    }

    @GetMapping("/tax-invoices/by-project/{projectNo}")
    public ResponseEntity<Map<String, Object>> getTaxInvoicesByProject(
            Authentication authentication, @PathVariable String projectNo) {
        AccessScope scope = scopeResolver.resolve(authentication);
        List<TaxInvoiceList> invoices = taxInvRepo.findByProjectNo(projectNo);
        if (!scope.isUnrestricted() && !invoices.isEmpty()) {
            requireProjectInScope(scope, invoices.get(0).getPrjMgrId());
        }
        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", invoices,
                "total", invoices.size()
        ));
    }
}
