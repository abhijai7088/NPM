package com.npms.core.controller;

import com.npms.core.entity.ProjectList;
import com.npms.core.exception.ForbiddenScopeException;
import com.npms.core.repository.ProjectListRepository;
import com.npms.core.security.AccessScope;
import com.npms.core.security.ScopeResolver;
import com.npms.core.specification.ProjectListSpecification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;
import com.npms.core.entity.AppUser;
import com.npms.core.entity.BillDeskList;
import com.npms.core.entity.PurchaseOrderList;
import com.npms.core.repository.AppUserRepository;
import com.npms.core.repository.BillDeskListRepository;
import com.npms.core.repository.PurchaseOrderListRepository;
import com.npms.core.service.EmailService;

@RestController
@RequestMapping("/api/v1/projects")
@CrossOrigin(origins = { "http://localhost:5195", "http://localhost:5190", "http://localhost:5173", "http://localhost:5174", "http://localhost:3000" })
public class ProjectListController {

    private final ProjectListRepository repo;
    private final PurchaseOrderListRepository poRepo;
    private final BillDeskListRepository billDeskRepo;
    private final AppUserRepository userRepo;
    private final EmailService emailService;
    private final ScopeResolver scopeResolver;

    public ProjectListController(ProjectListRepository repo, PurchaseOrderListRepository poRepo,
                                 BillDeskListRepository billDeskRepo,
                                 AppUserRepository userRepo, EmailService emailService,
                                 ScopeResolver scopeResolver) {
        this.repo = repo;
        this.poRepo = poRepo;
        this.billDeskRepo = billDeskRepo;
        this.userRepo = userRepo;
        this.emailService = emailService;
        this.scopeResolver = scopeResolver;
    }

    @GetMapping({"", "/", "/advanced-search"})
    public ResponseEntity<Map<String, Object>> advancedSearch(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String expiryStatus,
            @RequestParam(required = false) String expiryDays,
            @RequestParam(required = false) Integer commissionRate,
            @RequestParam(required = false) String financialStatus,
            @RequestParam(required = false) Boolean hasVendorPendingBills,
            @RequestParam(required = false) Boolean vendorBillNotSubmitted,
            @RequestParam(required = false) Boolean nicsiHoldLessThan20,
            @RequestParam(required = false) String projectManager,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) String ministry,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) String projectCategory,
            @RequestParam(required = false) Long prjMgrId,
            @RequestParam(required = false) Boolean provisionedOnly,
            @RequestParam(required = false) String managedBy,
            @RequestParam(required = false) Boolean hasVendorBilled,
            @RequestParam(required = false) Boolean hasExpBills,
            @RequestParam(required = false) Boolean hasPOs,
            @RequestParam(required = false) Boolean hasInvoiced) {

        AccessScope scope = scopeResolver.resolve(authentication);

        // ── Server-trusted scope resolution ──────────────────────────────
        // The client-supplied prjMgrId/managedBy/provisionedOnly parameters
        // below are NEVER used to widen access — they only let a caller who
        // is already unrestricted (or already scoped to a set of PMs)
        // optionally narrow their own view (e.g. an MD drilling into one of
        // their own PMs). AccessScope.requirePrjMgrId/requireOwnUsername
        // throw a 403 if the caller asks for something outside their scope.
        List<Long> provisionedIds; // the exact prjMgrId set this query is allowed to see; null = unrestricted
        Long effectivePrjMgrId = null; // an optional single-PM drill-down, still checked against scope

        if (scope.isPm()) {
            // A PM's scope is always exactly their own prjMgrId — resolved
            // server-side, never from a client parameter.
            provisionedIds = scope.allowedPrjMgrIds();
        } else if (scope.isMd()) {
            // Ignore any client-supplied managedBy — an MD can only ever see
            // their own live-resolved set of provisioned PMs.
            provisionedIds = scope.allowedPrjMgrIds();
            if (prjMgrId != null) {
                scope.requirePrjMgrId(prjMgrId); // throws 403 if not one of their own PMs
                effectivePrjMgrId = prjMgrId;
                provisionedIds = null; // drilling into one PM: use the single-id filter instead
            }
        } else {
            // SUPER_ADMIN: unrestricted by default, but may still honor an
            // explicit managedBy/provisionedOnly/prjMgrId filter as a
            // deliberate narrowing (not a privilege escalation, since they
            // already see everything).
            if (managedBy != null && !managedBy.isEmpty()) {
                provisionedIds = userRepo.findByRoleAndManagedBy("PM", managedBy.trim().toLowerCase()).stream()
                        .map(AppUser::getPrjMgrId)
                        .filter(Objects::nonNull)
                        .distinct()
                        .collect(Collectors.toList());
            } else if (Boolean.TRUE.equals(provisionedOnly)) {
                provisionedIds = userRepo.findByRole("PM").stream()
                        .map(AppUser::getPrjMgrId)
                        .filter(Objects::nonNull)
                        .distinct()
                        .collect(Collectors.toList());
            } else {
                provisionedIds = null;
            }
            effectivePrjMgrId = prjMgrId;
        }

        Specification<ProjectList> spec = ProjectListSpecification.advancedSearch(
                search, expiryStatus, expiryDays, commissionRate, financialStatus, hasVendorPendingBills,
                vendorBillNotSubmitted, nicsiHoldLessThan20,
                projectManager, state, ministry, department, projectCategory, effectivePrjMgrId, provisionedIds,
                hasVendorBilled, hasExpBills, hasPOs, hasInvoiced);

        // Fetch all matching for KPI aggregation
        List<ProjectList> allMatching = repo.findAll(spec);
        BigDecimal totalReceived = BigDecimal.ZERO;
        BigDecimal totalCommission = BigDecimal.ZERO;
        BigDecimal totalPo = BigDecimal.ZERO;
        BigDecimal totalVendorPending = BigDecimal.ZERO;

        for (ProjectList p : allMatching) {
            if (p.getAmountReceived() != null) totalReceived = totalReceived.add(p.getAmountReceived());
            if (p.getNicsiCommission() != null) totalCommission = totalCommission.add(p.getNicsiCommission());
            if (p.getPoAmount() != null) totalPo = totalPo.add(p.getPoAmount());
            if (p.getPoAmount() != null && p.getTotalAmountPaid() != null) {
                BigDecimal pending = p.getPoAmount().subtract(p.getTotalAmountPaid());
                if (pending.compareTo(BigDecimal.ZERO) > 0) {
                    totalVendorPending = totalVendorPending.add(pending);
                }
            }
        }

        Page<ProjectList> result = repo.findAll(spec, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "amountReceived")));

        // Enrich project data with PO expiry information
        List<String> expiredCodes = poRepo.findExpiredProjectCodes(LocalDate.now());
        Set<String> expiredSet = new HashSet<>(expiredCodes);

        LocalDate today = LocalDate.now();
        List<String> expiringSoonCodes = poRepo.findExpiringSoonProjectCodes(today, today.plusDays(90));
        Set<String> expiringSoonSet = new HashSet<>(expiringSoonCodes);

        // Map prjMgrId -> PM Full Name from app_user
        Map<Long, String> pmNameMap = userRepo.findByRole("PM").stream()
                .filter(u -> u.getPrjMgrId() != null)
                .collect(Collectors.toMap(
                        AppUser::getPrjMgrId,
                        u -> u.getFullName() != null ? u.getFullName() : u.getUsername(),
                        (existing, replacement) -> existing
                ));

        // Build enriched response with expiry status per project
        List<Map<String, Object>> enrichedData = result.getContent().stream().map(p -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("headerId", p.getHeaderId());
            map.put("projectId", p.getProjectId());
            map.put("prjMgrId", p.getPrjMgrId());
            map.put("prjMgrName", p.getPrjMgrId() != null ? pmNameMap.getOrDefault(p.getPrjMgrId(), "Atul Rastogi") : "Unassigned");
            map.put("projectCode", p.getProjectCode());
            map.put("projectName", p.getProjectName());
            map.put("customerName", p.getCustomerName());
            map.put("prjBudgetNo", p.getPrjBudgetNo());
            map.put("amountReceived", p.getAmountReceived());
            map.put("noOfPo", p.getNoOfPo());
            map.put("poAmount", p.getPoAmount());
            map.put("noOfInvBilldesk", p.getNoOfInvBilldesk());
            map.put("noOfExpInvoice", p.getNoOfExpInvoice());
            map.put("totalInvoiceAmount", p.getTotalInvoiceAmount());
            map.put("totalAmountPaid", p.getTotalAmountPaid());
            map.put("noOfTaxInvoice", p.getNoOfTaxInvoice());
            map.put("totalTaxInvoiceAmount", p.getTotalTaxInvoiceAmount());
            map.put("projectAbp", p.getProjectAbp());
            map.put("createdOn", p.getCreatedOn());
            map.put("prjType", p.getPrjType());
            map.put("userEmail", p.getUserEmail());
            map.put("mobileNumber", p.getMobileNumber());
            map.put("hodEmail", p.getHodEmail());
            map.put("nicCoordEmail", p.getNicCoordEmail());
            map.put("staffEmailId", p.getStaffEmailId());
            map.put("department", p.getDepartment());
            map.put("ministry", p.getMinistry());
            map.put("projectCategory", p.getProjectCategory());
            map.put("nicsiCommission", p.getNicsiCommission());
            map.put("commissionPercentage", p.getCommissionPercentage());
            map.put("financialStatus", p.getFinancialStatus());
            map.put("totalPenaltyAmt", p.getTotalPenaltyAmt() != null ? p.getTotalPenaltyAmt() : BigDecimal.ZERO);

            // ── Vendor billing / NICSI cash-hold computed flags ──────────────
            // See docs/PROJECT_FILTERS_AND_NICSI_HOLD.md for the full glossary
            // and worked examples behind these calculations.
            BigDecimal poAmt = p.getPoAmount() != null ? p.getPoAmount() : BigDecimal.ZERO;
            BigDecimal penaltyAmt = p.getTotalPenaltyAmt() != null ? p.getTotalPenaltyAmt() : BigDecimal.ZERO;
            BigDecimal effectivePoAmt = poAmt.subtract(penaltyAmt).max(BigDecimal.ZERO);
            
            BigDecimal paidAmt = p.getTotalAmountPaid() != null ? p.getTotalAmountPaid() : BigDecimal.ZERO;
            BigDecimal receivedAmt = p.getAmountReceived() != null ? p.getAmountReceived() : BigDecimal.ZERO;
            int billDeskCount = p.getNoOfInvBilldesk() != null ? p.getNoOfInvBilldesk() : 0;
            int poCount = p.getNoOfPo() != null ? p.getNoOfPo() : 0;

            BigDecimal vendorAmountPending = effectivePoAmt.subtract(paidAmt).max(BigDecimal.ZERO);
            boolean vendorHasBilled = billDeskCount > 0;
            boolean vendorBillNotSubmittedFlag = poCount > 0 && !vendorHasBilled;
            // Vendor has submitted at least one bill but NICSI still owes money against the PO.
            boolean billsNotPaidToVendor = vendorHasBilled && vendorAmountPending.compareTo(BigDecimal.ZERO) > 0;

            BigDecimal nicsiHoldAmount = receivedAmt.subtract(paidAmt);
            BigDecimal nicsiHoldRatio = effectivePoAmt.compareTo(BigDecimal.ZERO) > 0
                    ? nicsiHoldAmount.divide(effectivePoAmt, 4, java.math.RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            boolean nicsiHoldBelow20 = effectivePoAmt.compareTo(BigDecimal.ZERO) > 0
                    && vendorAmountPending.compareTo(BigDecimal.ZERO) > 0
                    && nicsiHoldRatio.compareTo(BigDecimal.valueOf(0.20)) < 0;

            map.put("vendorAmountPending", vendorAmountPending);
            map.put("vendorHasBilled", vendorHasBilled);
            map.put("vendorBillNotSubmitted", vendorBillNotSubmittedFlag);
            map.put("billsNotPaidToVendor", billsNotPaidToVendor);
            map.put("nicsiHoldAmount", nicsiHoldAmount);
            map.put("nicsiHoldPercentage", nicsiHoldRatio.multiply(BigDecimal.valueOf(100)));
            map.put("nicsiHoldBelow20", nicsiHoldBelow20);
            // Dynamic notice recommendation for the UI: only show a notice action
            // when the underlying condition it addresses is actually true.
            map.put("recommendVendorReminder", vendorBillNotSubmittedFlag);
            map.put("recommendVendorPaymentNotice", billsNotPaidToVendor);
            map.put("recommendGovtFundRequest", nicsiHoldBelow20);

            // Add expiry status
            String code = p.getProjectCode();
            if (expiredSet.contains(code)) {
                map.put("expiryStatus", "EXPIRED");
            } else if (expiringSoonSet.contains(code)) {
                map.put("expiryStatus", "EXPIRING_SOON");
            } else if (p.getNoOfPo() == null || p.getNoOfPo() == 0) {
                map.put("expiryStatus", "NO_PO");
            } else {
                map.put("expiryStatus", "ACTIVE");
            }

            // Get latest PO end date
            LocalDate latestEnd = poRepo.findLatestEndDate(code);
            map.put("poEndDate", latestEnd);

            return map;
        }).collect(Collectors.toList());

        // Server-confirmed scope description for an honest UI banner (the
        // frontend must not compute or trust this itself — it comes only
        // from what the backend actually enforced for this request).
        Map<String, Object> scopeInfo = new LinkedHashMap<>();
        scopeInfo.put("role", scope.role());
        scopeInfo.put("unrestricted", scope.isUnrestricted());
        scopeInfo.put("scopedPrjMgrIds", scope.allowedPrjMgrIds());

        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", enrichedData,
                "total", result.getTotalElements(),
                "page", page,
                "size", size,
                "pages", result.getTotalPages(),
                "message", "Projects fetched with advanced filters",
                "scope", scopeInfo,
                "kpis", Map.of(
                        "totalReceived", totalReceived,
                        "totalCommission", totalCommission,
                        "totalPo", totalPo,
                        "totalVendorPending", totalVendorPending
                )
        ));
    }

    private String formatINR(BigDecimal amount) {
        if (amount == null) return "INR 0.00";
        java.text.NumberFormat formatter = java.text.NumberFormat.getCurrencyInstance(new java.util.Locale("en", "IN"));
        return formatter.format(amount).replace("₹", "INR ").replace("Rs.", "INR ");
    }

    @GetMapping("/{headerId}/generate-notice")
    public ResponseEntity<Map<String, Object>> generateNotice(
            Authentication authentication,
            @PathVariable Long headerId,
            @RequestParam(defaultValue = "VENDOR") String noticeType,
            @RequestParam(defaultValue = "false") boolean includePoBreakdown,
            @RequestParam(defaultValue = "false") boolean includeBillBreakdown) {

        AccessScope scope = scopeResolver.resolve(authentication);
        ProjectList project = repo.findById(headerId).orElse(null);
        if (project == null) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Project not found"));
        }
        if (!scope.isUnrestricted()) {
            if (project.getPrjMgrId() == null || !scope.allowedPrjMgrIds().contains(project.getPrjMgrId())) {
                throw ForbiddenScopeException.forResource("this project's notices");
            }
        }

        // Generate reference number: NICSI/PMD/{YEAR}/{PROJECT_CODE}/{SERIAL}
        String refNo = "NICSI/PMD/" + java.time.LocalDate.now().getYear() + "/" + project.getProjectCode() + "/" + String.format("%04d", headerId % 10000);
        String dateStr = java.time.format.DateTimeFormatter.ofPattern("dd MMMM yyyy").format(java.time.LocalDate.now());

        // Calculate financial details
        BigDecimal poAmt = project.getPoAmount() != null ? project.getPoAmount() : BigDecimal.ZERO;
        BigDecimal amtPaid = project.getTotalAmountPaid() != null ? project.getTotalAmountPaid() : BigDecimal.ZERO;
        BigDecimal amtReceived = project.getAmountReceived() != null ? project.getAmountReceived() : BigDecimal.ZERO;
        BigDecimal budget = project.getPrjBudgetNo() != null ? project.getPrjBudgetNo() : BigDecimal.ZERO;
        BigDecimal penaltyAmt = project.getTotalPenaltyAmt() != null ? project.getTotalPenaltyAmt() : BigDecimal.ZERO;
        BigDecimal effectivePoAmt = poAmt.subtract(penaltyAmt).max(BigDecimal.ZERO);
        BigDecimal vendorPending = effectivePoAmt.subtract(amtPaid).max(BigDecimal.ZERO);
        BigDecimal clientPending = budget.subtract(amtReceived).max(BigDecimal.ZERO);
        BigDecimal nicsiCommission = project.getNicsiCommission() != null ? project.getNicsiCommission() : BigDecimal.ZERO;
        BigDecimal nicsiHoldAmt = amtReceived.subtract(amtPaid);

        double nicsiHoldPct = effectivePoAmt.compareTo(BigDecimal.ZERO) > 0
                ? (nicsiHoldAmt.doubleValue() / effectivePoAmt.doubleValue()) * 100.0
                : 0.0;

        BigDecimal commPctDecimal = project.getCommissionPercentage() != null ? project.getCommissionPercentage() : BigDecimal.valueOf(7);
        String commPct = String.format("%.1f", commPctDecimal.doubleValue());

        // Sub-registers details
        int noOfPo = project.getNoOfPo() != null ? project.getNoOfPo() : 0;
        int noOfExpInv = project.getNoOfExpInvoice() != null ? project.getNoOfExpInvoice() : 0;
        int noOfTaxInv = project.getNoOfTaxInvoice() != null ? project.getNoOfTaxInvoice() : 0;
        BigDecimal totInvAmt = project.getTotalInvoiceAmount() != null ? project.getTotalInvoiceAmount() : BigDecimal.ZERO;
        BigDecimal totTaxInvAmt = project.getTotalTaxInvoiceAmount() != null ? project.getTotalTaxInvoiceAmount() : BigDecimal.ZERO;

        // Common letterhead HTML
        String letterhead = "<div style='font-family: \"Segoe UI\", Arial, sans-serif; max-width: 760px; margin: 0 auto; border: 2px solid #003366; padding: 0; background: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.1);'>" +
                // Header with logos and org name
                "<div style='background: linear-gradient(135deg, #003366, #004d99); color: white; padding: 18px 25px; text-align: center; border-bottom: 3px solid #FF6600;'>" +
                "<div style='font-size: 11px; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 4px; text-transform: uppercase;'>Government of India</div>" +
                "<div style='font-size: 11px; margin-bottom: 8px; opacity: 0.95;'>Ministry of Electronics &amp; Information Technology (MeitY)</div>" +
                "<div style='font-size: 18px; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 4px;'>NATIONAL INFORMATICS CENTRE SERVICES INC.</div>" +
                "<div style='font-size: 10px; opacity: 0.9;'>Hall No. 2 &amp; 3, 6th Floor, NBCC Tower, 15 Bhikaji Cama Place, New Delhi - 110066</div>" +
                "<div style='font-size: 10px; opacity: 0.9;'>Tel: +91-11-22900525 | Email: info-nicsi@nic.in | Web: www.nicsi.com</div>" +
                "</div>" +
                // Reference line
                "<div style='display: flex; justify-content: space-between; padding: 12px 25px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #1e293b; font-weight: 600;'>" +
                "<div><strong>Ref No:</strong> <span style='color: #003366;'>" + refNo + "</span></div>" +
                "<div><strong>Date:</strong> " + dateStr + "</div>" +
                "</div>";

        // Fetch vendor name from PO register
        List<PurchaseOrderList> poList = poRepo.findByProjectNo(project.getProjectCode());
        String vendorName = (poList != null && !poList.isEmpty() && poList.get(0).getVendorName() != null)
                ? poList.get(0).getVendorName()
                : "Empanelled Service Provider";

        String htmlContent = "";
        String title = "";
        String toEmail = "";

        if ("VENDOR_REMINDER".equalsIgnoreCase(noticeType)) {
            title = "Reminder: Please Submit Your Expenditure Bills [" + project.getProjectCode() + "]";
            toEmail = project.getStaffEmailId() != null ? project.getStaffEmailId() : "vendor@nicsi.com";

            htmlContent = letterhead +
                    "<div style='padding: 22px 25px; font-size: 12px; line-height: 1.7; color: #1e293b;'>" +
                    "<p style='margin-bottom: 14px;'><strong>To,</strong><br/>" +
                    "The Authorized Signatory / Vendor Representative,<br/>" +
                    "<strong style='color: #003366; font-size: 13px;'>" + vendorName + "</strong><br/>" +
                    "<span style='font-size: 11px; color: #64748b;'>(Empanelled Vendor for Project: " + project.getCustomerName() + ")</span></p>" +

                    "<p style='margin-bottom: 14px; background: #f1f5f9; padding: 10px 14px; border-left: 4px solid #003366; border-radius: 4px;'>" +
                    "<strong>Subject:</strong> <u>Reminder to Submit Expenditure Bills Against Purchase Order</u><br/>" +
                    "<strong>Project Code & Ref:</strong> " + project.getProjectCode() + " &nbsp;|&nbsp; <strong>Sanction Date:</strong> " + project.getCreatedOn() + "</p>" +

                    "<p>Sir/Madam,</p>" +

                    "<p>With reference to Purchase Order(s) issued to your organization under the above-captioned project, our Project Monitoring & Bill Desk records indicate that no expenditure bills/invoices have been uploaded to date.</p>" +

                    "<div style='margin: 16px 0; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;'>" +
                    "<div style='background: #003366; color: white; padding: 8px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase;'>Purchase Order & Billing Summary</div>" +
                    "<table style='width: 100%; border-collapse: collapse; font-size: 11px;'>" +
                    "<tbody>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Project Name</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right;'>" + project.getProjectName() + "</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Total Active PO Count</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;'>" + noOfPo + " PO(s)</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Total PO Value Allotted</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #003366;'>" + formatINR(poAmt) + "</td></tr>" +
                    "<tr><td style='padding: 8px 12px; font-weight: 600;'>Bills Submitted in Bill Desk</td><td style='padding: 8px 12px; text-align: right; color: #dc2626; font-weight: bold;'>0 Bills Received</td></tr>" +
                    "</tbody></table></div>" +

                    "<p>You are requested to upload your milestone invoices and work completion reports on the NICSI Bill Desk portal immediately to enable timely verification and clearance of funds.</p>" +

                    "<div style='margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end;'>" +
                    "<div>" +
                    "<p style='margin: 0;'>Yours faithfully,</p>" +
                    "<div style='margin-top: 20px;'>" +
                    "<p style='margin: 0; font-weight: bold; color: #003366;'>Accounts & Billing Division</p>" +
                    "<p style='margin: 0; font-size: 11px;'>Project Monitoring Department</p>" +
                    "<p style='margin: 0; font-size: 11px; font-weight: 600;'>National Informatics Centre Services Inc. (NICSI)</p>" +
                    "</div></div></div>" +
                    "</div>" +

                    "<div style='background: #f8fafc; padding: 10px 25px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center;'>" +
                    "This is an official system-generated notice from NICSI Project Monitoring System (NPMS). For verification, quote Ref No: " + refNo +
                    "</div></div>";

        } else if ("VENDOR".equalsIgnoreCase(noticeType)) {
            title = "Notice: Pending Vendor Bills & Expenditure Submission [" + project.getProjectCode() + "]";
            toEmail = project.getStaffEmailId() != null ? project.getStaffEmailId() : "vendor@nicsi.com";

            htmlContent = letterhead +
                    "<div style='padding: 22px 25px; font-size: 12px; line-height: 1.7; color: #1e293b;'>" +
                    "<p style='margin-bottom: 14px;'><strong>To,</strong><br/>" +
                    "The Authorized Signatory / Vendor Representative,<br/>" +
                    "<strong style='color: #003366; font-size: 13px;'>" + vendorName + "</strong><br/>" +
                    "<span style='font-size: 11px; color: #64748b;'>(Empanelled Vendor for Project: " + project.getCustomerName() + ")</span></p>" +

                    "<p style='margin-bottom: 14px; background: #f1f5f9; padding: 10px 14px; border-left: 4px solid #003366; border-radius: 4px;'>" +
                    "<strong>Subject:</strong> <u>Notice for Submission of Pending Expenditure Bills</u><br/>" +
                    "<strong>Project Code & Ref:</strong> " + project.getProjectCode() + " &nbsp;|&nbsp; <strong>Sanction Date:</strong> " + project.getCreatedOn() + "</p>" +

                    "<p>Sir/Madam,</p>" +

                    "<p>This notice is issued with reference to Purchase Order(s) allotted under the above project executed through NICSI under GFR 2017 / GeM framework. Please find below the statement of accounts as per our records:</p>" +

                    "<div style='margin: 16px 0; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;'>" +
                    "<div style='background: #003366; color: white; padding: 8px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase;'>Vendor Account Statement</div>" +
                    "<table style='width: 100%; border-collapse: collapse; font-size: 11px;'>" +
                    "<tbody>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Total PO Value Allotted</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;'>" + formatINR(poAmt) + "</td></tr>" +
                    (penaltyAmt.compareTo(BigDecimal.ZERO) > 0
                            ? "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #dc2626;'>Less: Fines / Penalty Imposed</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626; font-weight: bold;'>- " + formatINR(penaltyAmt) + "</td></tr>"
                            : "") +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Effective PO Commitment</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #003366;'>" + formatINR(effectivePoAmt) + "</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Total Amount Paid to Date</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #16a34a; font-weight: bold;'>" + formatINR(amtPaid) + "</td></tr>" +
                    "<tr style='background: #fef2f2;'><td style='padding: 8px 12px; font-weight: bold; color: #991b1b;'>Balance Amount Pending Payment</td><td style='padding: 8px 12px; text-align: right; font-weight: bold; color: #dc2626;'>" + formatINR(vendorPending) + "</td></tr>" +
                    "</tbody></table></div>" +

                    "<p>You are requested to submit all outstanding expenditure bills along with milestone completion reports within <strong>7 (seven) working days</strong> from the receipt of this notice.</p>" +
                    "<ol style='margin: 8px 0; padding-left: 20px; color: #334155;'>" +
                    "<li>Expedite submission of pending expenditure bills via the NICSI Bill Desk portal.</li>" +
                    "<li>Ensure all invoices clearly reference PO Code: <strong>" + project.getProjectCode() + "</strong>.</li>" +
                    "<li>Contact the NIC Coordinator (" + (project.getNicCoordEmail() != null ? project.getNicCoordEmail() : "assigned coordinator") + ") for milestone verification.</li>" +
                    "</ol>" +

                    "<div style='margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end;'>" +
                    "<div>" +
                    "<p style='margin: 0;'>Yours faithfully,</p>" +
                    "<div style='margin-top: 20px;'>" +
                    "<p style='margin: 0; font-weight: bold; color: #003366;'>Accounts & Billing Division</p>" +
                    "<p style='margin: 0; font-size: 11px;'>Project Monitoring Department</p>" +
                    "<p style='margin: 0; font-size: 11px; font-weight: 600;'>National Informatics Centre Services Inc. (NICSI)</p>" +
                    "</div></div></div>" +
                    "</div>" +

                    "<div style='background: #f8fafc; padding: 10px 25px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center;'>" +
                    "This is an official system-generated notice from NICSI Project Monitoring System (NPMS). For verification, quote Ref No: " + refNo +
                    "</div></div>";

        } else if ("PO_EXPIRY".equalsIgnoreCase(noticeType) || "PO_EXPIRING".equalsIgnoreCase(noticeType) || "EXPIRY".equalsIgnoreCase(noticeType)) {
            List<String> expiredCodes = poRepo.findExpiredProjectCodes(LocalDate.now());
            Set<String> expiredSet = new HashSet<>(expiredCodes);
            boolean isExpired = expiredSet.contains(project.getProjectCode());
            String statusText = isExpired ? "EXPIRED" : "EXPIRING SOON";
            title = "Official Communication: Purchase Order " + statusText + " — Validity Extension Request [" + project.getProjectCode() + "]";
            toEmail = project.getUserEmail() != null ? project.getUserEmail() : (project.getHodEmail() != null ? project.getHodEmail() : "client@gov.in");

            StringBuilder poAnnexureHtml = new StringBuilder();
            poAnnexureHtml.append("<div style='margin-top: 18px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;'>")
                    .append("<div style='background: #003366; color: white; padding: 8px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;'>Itemized Purchase Order (PO) Validity Schedule</div>")
                    .append("<table style='width: 100%; border-collapse: collapse; font-size: 11px;'>")
                    .append("<thead><tr style='background: #e2e8f0; color: #0f172a; font-size: 10px; text-transform: uppercase;'>")
                    .append("<th style='padding: 6px 8px; text-align: left; border-bottom: 1px solid #cbd5e1;'>#</th>")
                    .append("<th style='padding: 6px 8px; text-align: left; border-bottom: 1px solid #cbd5e1;'>PO Number</th>")
                    .append("<th style='padding: 6px 8px; text-align: left; border-bottom: 1px solid #cbd5e1;'>Empanelled Vendor Name</th>")
                    .append("<th style='padding: 6px 8px; text-align: center; border-bottom: 1px solid #cbd5e1;'>Validity Period</th>")
                    .append("<th style='padding: 6px 8px; text-align: right; border-bottom: 1px solid #cbd5e1;'>PO Amount (INR)</th>")
                    .append("<th style='padding: 6px 8px; text-align: center; border-bottom: 1px solid #cbd5e1;'>Status</th>")
                    .append("</tr></thead><tbody>");

            if (poList == null || poList.isEmpty()) {
                poAnnexureHtml.append("<tr><td colspan='6' style='padding: 10px; text-align: center; color: #64748b;'>No Purchase Orders found under this project.</td></tr>");
            } else {
                int idx = 1;
                for (PurchaseOrderList p : poList) {
                    String poNo = p.getFinalPoNo() != null ? p.getFinalPoNo() : ("PO-" + idx);
                    String vName = p.getVendorName() != null ? p.getVendorName() : "Empanelled Service Provider";
                    String period = (p.getFrdate() != null ? p.getFrdate().toString() : "—") + " to " + (p.getTodate() != null ? p.getTodate().toString() : "—");
                    BigDecimal val = p.getTotal() != null ? p.getTotal() : BigDecimal.ZERO;
                    boolean poExpired = p.getTodate() != null && p.getTodate().isBefore(LocalDate.now());

                    poAnnexureHtml.append("<tr style='border-bottom: 1px solid #e2e8f0;'>")
                            .append("<td style='padding: 6px 8px;'>").append(idx++).append("</td>")
                            .append("<td style='padding: 6px 8px; font-weight: 600; color: #003366;'>").append(poNo).append("</td>")
                            .append("<td style='padding: 6px 8px;'>").append(vName).append("</td>")
                            .append("<td style='padding: 6px 8px; text-align: center; color: #475569;'>").append(period).append("</td>")
                            .append("<td style='padding: 6px 8px; text-align: right; font-weight: bold;'>").append(formatINR(val)).append("</td>")
                            .append("<td style='padding: 6px 8px; text-align: center;'><span style='background: ").append(poExpired ? "#fee2e2; color: #991b1b;" : "#fef3c7; color: #b45309;").append(" padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;'>").append(poExpired ? "EXPIRED" : "EXPIRING SOON").append("</span></td>")
                            .append("</tr>");
                }
            }
            poAnnexureHtml.append("</tbody></table></div>");

            htmlContent = letterhead +
                    "<div style='padding: 22px 25px; font-size: 12px; line-height: 1.7; color: #1e293b;'>" +
                    "<p style='margin-bottom: 14px;'><strong>To,</strong><br/>" +
                    "The Competent Authority / Head of Department,<br/>" +
                    "<strong style='color: #003366; font-size: 13px;'>" + project.getCustomerName() + "</strong></p>" +

                    "<p style='margin-bottom: 14px; background: " + (isExpired ? "#fef2f2; border-left: 4px solid #dc2626;" : "#fffbe6; border-left: 4px solid #d97706;") + " padding: 12px 16px; border-radius: 4px;'>" +
                    "<strong>Subject:</strong> <u>" + (isExpired ? "URGENT: Notice for Extension / Renewal of Expired Purchase Order(s)" : "NOTICE: Approaching Expiry of Purchase Order(s) — Request for Extension") + "</u><br/>" +
                    "<strong>Project Name:</strong> " + project.getProjectName() + "<br/>" +
                    "<strong>Project Code & Ref:</strong> " + project.getProjectCode() + " &nbsp;|&nbsp; <strong>Budget Head:</strong> #" + project.getPrjBudgetNo() + " &nbsp;|&nbsp; <strong>Sanction Date:</strong> " + project.getCreatedOn() + "</p>" +

                    "<p>Respected Sir/Madam,</p>" +

                    "<p>Greetings from National Informatics Centre Services Inc. (NICSI). This communication is issued with reference to the implementation of the above-mentioned project executed by NICSI for your esteemed organization under General Financial Rules (GFR) 2017 / GeM framework.</p>" +

                    "<p>As per the official records of the NICSI Project Monitoring System (NPMS), the validity of Purchase Order(s) issued for this project is currently <strong><span style='color: " + (isExpired ? "#dc2626" : "#d97706") + "; font-size: 13px;'>" + statusText + "</span></strong>. The detailed summary of the project financial head and PO validity is given below:</p>" +

                    "<div style='margin: 16px 0; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;'>" +
                    "<div style='background: #003366; color: white; padding: 8px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;'>Project Financial & PO Validity Summary</div>" +
                    "<table style='width: 100%; border-collapse: collapse; font-size: 11px;'>" +
                    "<tbody>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Client / User Department</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #003366; font-weight: bold;'>" + project.getCustomerName() + "</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Total Allotted PO Count</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;'>" + noOfPo + " PO(s)</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Total PO Allotted Amount</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #003366;'>" + formatINR(poAmt) + "</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Total Amount Paid to Date</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #16a34a; font-weight: bold;'>" + formatINR(amtPaid) + "</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Current PO Validity Status</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: " + (isExpired ? "#dc2626" : "#d97706") + ";'>" + statusText + "</td></tr>" +
                    "</tbody></table></div>" +

                    poAnnexureHtml.toString() +

                    "<p style='margin-top: 18px;'>Under <strong>Rule 225 and Rule 230 of General Financial Rules (GFR) 2017</strong>, active validity of Purchase Orders is mandatory for audit compliance, processing vendor milestone invoices, and maintaining seamless operations.</p>" +

                    "<p>In view of the above, we kindly request your office to issue a formal <strong>PO Validity Extension / Contract Renewal Sanction Order</strong> for the project at the earliest.</p>" +

                    "<p style='margin-bottom: 6px;'><strong>Key Nodal Coordination Contact Details:</strong></p>" +
                    "<table style='width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; background: #f8fafc; border: 1px solid #e2e8f0;'>" +
                    "<tbody>" +
                    "<tr><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0;'><strong>Client Lead Email:</strong></td><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #003366;'>" + (project.getUserEmail() != null ? project.getUserEmail() : "Not specified") + "</td></tr>" +
                    "<tr><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0;'><strong>HOD Email:</strong></td><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #003366;'>" + (project.getHodEmail() != null ? project.getHodEmail() : "Not specified") + "</td></tr>" +
                    "<tr><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0;'><strong>NIC Coordinator:</strong></td><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #003366;'>" + (project.getNicCoordEmail() != null ? project.getNicCoordEmail() : "Not specified") + "</td></tr>" +
                    "<tr><td style='padding: 6px 12px;'><strong>NICSI Project Manager:</strong></td><td style='padding: 6px 12px; color: #003366;'>" + (project.getStaffEmailId() != null ? project.getStaffEmailId() : "info-nicsi@nic.in") + "</td></tr>" +
                    "</tbody></table>" +

                    "<div style='margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end;'>" +
                    "<div>" +
                    "<p style='margin: 0;'>With warm regards,</p>" +
                    "<div style='margin-top: 20px;'>" +
                    "<p style='margin: 0; font-weight: bold; color: #003366;'>Project Monitoring & Contracts Division</p>" +
                    "<p style='margin: 0; font-size: 11px;'>National Informatics Centre Services Inc. (NICSI)</p>" +
                    "<p style='margin: 0; font-size: 11px; color: #64748b;'>An Enterprise of NIC under MeitY, Govt. of India</p>" +
                    "</div></div></div>" +
                    "</div>" +

                    "<div style='background: #f8fafc; padding: 10px 25px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center;'>" +
                    "This is an official system-generated communication from NICSI Project Monitoring System (NPMS). Ref No: " + refNo +
                    "</div></div>";

        } else if ("GOVT".equalsIgnoreCase(noticeType) || "CLIENT".equalsIgnoreCase(noticeType)) {
            title = "Request for Release of Pending Funds [" + project.getProjectCode() + "]";
            toEmail = project.getUserEmail() != null ? project.getUserEmail() : (project.getHodEmail() != null ? project.getHodEmail() : "client@gov.in");

            // Build PO Annexure Table (Annexure A)
            StringBuilder poAnnexureHtml = new StringBuilder();
            if (includePoBreakdown) {
                poAnnexureHtml.append("<div style='margin-top: 22px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;'>")
                        .append("<div style='background: #003366; color: white; padding: 8px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;'>Annexure A: Itemized Purchase Order (PO) Bifurcation Schedule</div>")
                        .append("<table style='width: 100%; border-collapse: collapse; font-size: 11px;'>")
                        .append("<thead><tr style='background: #e2e8f0; color: #0f172a; font-size: 10px; text-transform: uppercase;'>")
                        .append("<th style='padding: 6px 8px; text-align: left; border-bottom: 1px solid #cbd5e1;'>#</th>")
                        .append("<th style='padding: 6px 8px; text-align: left; border-bottom: 1px solid #cbd5e1;'>PO Number</th>")
                        .append("<th style='padding: 6px 8px; text-align: left; border-bottom: 1px solid #cbd5e1;'>Empanelled Vendor Name</th>")
                        .append("<th style='padding: 6px 8px; text-align: center; border-bottom: 1px solid #cbd5e1;'>Validity Period</th>")
                        .append("<th style='padding: 6px 8px; text-align: right; border-bottom: 1px solid #cbd5e1;'>PO Amount</th>")
                        .append("<th style='padding: 6px 8px; text-align: center; border-bottom: 1px solid #cbd5e1;'>Status</th>")
                        .append("</tr></thead><tbody>");

                if (poList == null || poList.isEmpty()) {
                    poAnnexureHtml.append("<tr><td colspan='6' style='padding: 10px; text-align: center; color: #64748b;'>No active Purchase Orders found under this project.</td></tr>");
                } else {
                    int idx = 1;
                    for (PurchaseOrderList p : poList) {
                        String poNo = p.getFinalPoNo() != null ? p.getFinalPoNo() : ("PO-" + idx);
                        String vName = p.getVendorName() != null ? p.getVendorName() : "Empanelled Vendor";
                        String period = (p.getFrdate() != null ? p.getFrdate().toString() : "?") + " to " + (p.getTodate() != null ? p.getTodate().toString() : "?");
                        BigDecimal val = p.getTotal() != null ? p.getTotal() : BigDecimal.ZERO;
                        String status = p.getApprovalStatus() != null ? p.getApprovalStatus() : "ACTIVE";

                        poAnnexureHtml.append("<tr style='border-bottom: 1px solid #e2e8f0;'>")
                                .append("<td style='padding: 6px 8px;'>").append(idx++).append("</td>")
                                .append("<td style='padding: 6px 8px; font-weight: 600; color: #003366;'>").append(poNo).append("</td>")
                                .append("<td style='padding: 6px 8px;'>").append(vName).append("</td>")
                                .append("<td style='padding: 6px 8px; text-align: center; color: #475569;'>").append(period).append("</td>")
                                .append("<td style='padding: 6px 8px; text-align: right; font-weight: bold;'>").append(formatINR(val)).append("</td>")
                                .append("<td style='padding: 6px 8px; text-align: center;'><span style='background: #dcfce7; color: #15803d; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;'>").append(status).append("</span></td>")
                                .append("</tr>");
                    }
                }
                poAnnexureHtml.append("</tbody></table></div>");
            }

            // Build Bill Annexure Table (Annexure B)
            StringBuilder billAnnexureHtml = new StringBuilder();
            if (includeBillBreakdown) {
                List<BillDeskList> billList = billDeskRepo.findByProjectNo(project.getProjectCode());
                billAnnexureHtml.append("<div style='margin-top: 22px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;'>")
                        .append("<div style='background: #003366; color: white; padding: 8px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;'>Annexure B: Itemized Expenditure Bills & Disbursals Bifurcation Schedule</div>")
                        .append("<table style='width: 100%; border-collapse: collapse; font-size: 11px;'>")
                        .append("<thead><tr style='background: #e2e8f0; color: #0f172a; font-size: 10px; text-transform: uppercase;'>")
                        .append("<th style='padding: 6px 8px; text-align: left; border-bottom: 1px solid #cbd5e1;'>#</th>")
                        .append("<th style='padding: 6px 8px; text-align: left; border-bottom: 1px solid #cbd5e1;'>Bill / Invoice No</th>")
                        .append("<th style='padding: 6px 8px; text-align: left; border-bottom: 1px solid #cbd5e1;'>Empanelled Vendor</th>")
                        .append("<th style='padding: 6px 8px; text-align: center; border-bottom: 1px solid #cbd5e1;'>Invoice Date</th>")
                        .append("<th style='padding: 6px 8px; text-align: right; border-bottom: 1px solid #cbd5e1;'>Billed Amt (INR)</th>")
                        .append("<th style='padding: 6px 8px; text-align: right; border-bottom: 1px solid #cbd5e1;'>Paid Amt (INR)</th>")
                        .append("<th style='padding: 6px 8px; text-align: right; border-bottom: 1px solid #cbd5e1;'>Balance (INR)</th>")
                        .append("<th style='padding: 6px 8px; text-align: center; border-bottom: 1px solid #cbd5e1;'>Status</th>")
                        .append("</tr></thead><tbody>");

                if (billList == null || billList.isEmpty()) {
                    billAnnexureHtml.append("<tr><td colspan='8' style='padding: 10px; text-align: center; color: #64748b;'>No Bill Desk expenditure invoices found under this project.</td></tr>");
                } else {
                    int idx = 1;
                    for (BillDeskList b : billList) {
                        String invNo = b.getInvoiceNum() != null ? b.getInvoiceNum().toString() : (b.getInvoiceNo() != null ? b.getInvoiceNo().toString() : ("INV-" + idx));
                        String vName = b.getVendorName() != null ? b.getVendorName() : "Vendor";
                        String invDate = b.getInvoiceDate() != null ? b.getInvoiceDate().toString() : "—";
                        BigDecimal bAmt = b.getInvoiceAmount() != null ? BigDecimal.valueOf(b.getInvoiceAmount()) : BigDecimal.ZERO;
                        BigDecimal pAmt = b.getAmountPaid() != null ? BigDecimal.valueOf(b.getAmountPaid()) : BigDecimal.ZERO;
                        BigDecimal bal = bAmt.subtract(pAmt).max(BigDecimal.ZERO);
                        String st = b.getStatus() != null ? b.getStatus() : (bal.compareTo(BigDecimal.ZERO) == 0 ? "PAID" : "PENDING");

                        billAnnexureHtml.append("<tr style='border-bottom: 1px solid #e2e8f0;'>")
                                .append("<td style='padding: 6px 8px;'>").append(idx++).append("</td>")
                                .append("<td style='padding: 6px 8px; font-weight: 600; color: #003366;'>").append(invNo).append("</td>")
                                .append("<td style='padding: 6px 8px;'>").append(vName).append("</td>")
                                .append("<td style='padding: 6px 8px; text-align: center; color: #475569;'>").append(invDate).append("</td>")
                                .append("<td style='padding: 6px 8px; text-align: right;'>").append(formatINR(bAmt)).append("</td>")
                                .append("<td style='padding: 6px 8px; text-align: right; color: #16a34a;'>").append(formatINR(pAmt)).append("</td>")
                                .append("<td style='padding: 6px 8px; text-align: right; font-weight: bold; color: ").append(bal.compareTo(BigDecimal.ZERO) > 0 ? "#dc2626" : "#475569").append(";'>").append(formatINR(bal)).append("</td>")
                                .append("<td style='padding: 6px 8px; text-align: center;'><span style='background: ").append("PAID".equalsIgnoreCase(st) ? "#dcfce7; color: #15803d;" : "#fef3c7; color: #b45309;").append(" padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;'>").append(st).append("</span></td>")
                                .append("</tr>");
                    }
                }
                billAnnexureHtml.append("</tbody></table></div>");
            }

            htmlContent = letterhead +
                    "<div style='padding: 22px 25px; font-size: 12px; line-height: 1.7; color: #1e293b;'>" +
                    "<p style='margin-bottom: 14px;'><strong>To,</strong><br/>" +
                    "The Competent Authority / Head of Department,<br/>" +
                    "<strong style='color: #003366; font-size: 13px;'>" + project.getCustomerName() + "</strong></p>" +

                    "<p style='margin-bottom: 14px; background: #f1f5f9; padding: 10px 14px; border-left: 4px solid #003366; border-radius: 4px;'>" +
                    "<strong>Subject:</strong> <u>Request for Release of Pending Funds for Project Execution under GFR 2017</u><br/>" +
                    "<strong>Project Name:</strong> " + project.getProjectName() + "<br/>" +
                    "<strong>Project Ref Code:</strong> " + project.getProjectCode() + " &nbsp;|&nbsp; <strong>Budget Head:</strong> #" + project.getPrjBudgetNo() + " &nbsp;|&nbsp; <strong>Sanction Date:</strong> " + project.getCreatedOn() + "</p>" +

                    "<p>Respected Sir/Madam,</p>" +

                    "<p>Greetings from National Informatics Centre Services Inc. (NICSI). We write with reference to the implementation of the above-mentioned project being executed by NICSI for your esteemed organization under the framework of GFR 2017.</p>" +

                    "<p>As per the Project Registry and NICSI Financial Accounting records, below is the comprehensive statement of project funds, commitments, and current cash position:</p>" +

                    // Comprehensive Multi-Section Financial Position Table
                    "<div style='margin: 16px 0; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;'>" +
                    "<div style='background: #003366; color: white; padding: 8px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;'>Project Financial Statement & Cash Position</div>" +
                    "<table style='width: 100%; border-collapse: collapse; font-size: 11px;'>" +
                    "<thead><tr style='background: #e2e8f0; color: #0f172a; text-transform: uppercase; font-size: 10px;'>" +
                    "<th style='padding: 8px 12px; text-align: left; border-bottom: 1px solid #cbd5e1;'>Financial Head / Particulars</th>" +
                    "<th style='padding: 8px 12px; text-align: right; border-bottom: 1px solid #cbd5e1;'>Amount (INR)</th>" +
                    "</tr></thead>" +
                    "<tbody>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Available Project Balance</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #0f172a;'>" + formatINR(budget) + "</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Total PO Value</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #003366;'>" + formatINR(poAmt) + " (" + noOfPo + " POs" + (includePoBreakdown ? " — Annexure A Attached" : "") + ")</td></tr>" +
                    (penaltyAmt.compareTo(BigDecimal.ZERO) > 0
                            ? "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #dc2626;'>Less: Vendor Penalty / Fines Deducted</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #dc2626; font-weight: bold;'>- " + formatINR(penaltyAmt) + "</td></tr>"
                            : "") +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Effective Vendor PO Commitment</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: #003366;'>" + formatINR(effectivePoAmt) + "</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Total Expenditure Billed & Paid to Vendors</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #16a34a; font-weight: bold;'>" + formatINR(amtPaid) + " (" + noOfExpInv + " Bills" + (includeBillBreakdown ? " — Annexure B Attached" : "") + ")</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Project Funds Received</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #16a34a; font-weight: bold;'>" + formatINR(amtReceived) + "</td></tr>" +
                    "<tr><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;'>Current NICSI Cash Hold Position</td><td style='padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold; color: " + (nicsiHoldPct < 20.0 ? "#dc2626" : "#16a34a") + ";'>" + formatINR(nicsiHoldAmt) + " (" + String.format("%.1f", nicsiHoldPct) + "% Hold Ratio)</td></tr>" +
                    "<tr style='background: #fef2f2;'><td style='padding: 10px 12px; font-weight: bold; color: #991b1b;'>Balance Funds Pending Release from Client</td><td style='padding: 10px 12px; text-align: right; font-weight: bold; font-size: 13px; color: #dc2626;'>" + formatINR(clientPending) + "</td></tr>" +
                    "</tbody></table></div>" +

                    "<div style='background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; font-size: 11px;'>" +
                    "<strong>Sub-Register Deliverables Summary:</strong>" +
                    "<ul style='margin: 6px 0 0 0; padding-left: 20px; color: #475569;'>" +
                    "<li><strong>Total POs:</strong> " + noOfPo + " Active PO(s) amounting to " + formatINR(poAmt) + (includePoBreakdown ? " (Detailed schedule attached in Annexure A)" : "") + "</li>" +
                    "<li><strong>Bills Submitted:</strong> " + noOfExpInv + " Bill(s) processed amounting to " + formatINR(totInvAmt) + (includeBillBreakdown ? " (Detailed schedule attached in Annexure B)" : "") + "</li>" +
                    "<li><strong>Tax Invoices Raised:</strong> " + noOfTaxInv + " Invoice(s) raised amounting to " + formatINR(totTaxInvAmt) + "</li>" +
                    "</ul></div>" +

                    // Append Annexure A and Annexure B here
                    poAnnexureHtml.toString() +
                    billAnnexureHtml.toString() +

                    "<p style='margin-top: 18px;'>Under <strong>Rule 230(1) and Rule 238 of General Financial Rules (GFR) 2017</strong>, timely release of balance project funds is essential to maintain required operational cash liquidity for vendor payment commitments and uninterrupted milestone execution.</p>" +

                    "<p>In view of the above, we kindly request your office to expedite the release of the balance pending amount of <strong>" + formatINR(clientPending) + "</strong> to NICSI at the earliest.</p>" +

                    "<p style='margin-bottom: 6px;'><strong>Designated Project Coordination Directory:</strong></p>" +
                    "<table style='width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; background: #f8fafc; border: 1px solid #e2e8f0;'>" +
                    "<tbody>" +
                    "<tr><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0;'><strong>Client / User Lead Email:</strong></td><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #003366;'>" + (project.getUserEmail() != null ? project.getUserEmail() : "Not specified") + "</td></tr>" +
                    "<tr><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0;'><strong>HOD Email:</strong></td><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #003366;'>" + (project.getHodEmail() != null ? project.getHodEmail() : "Not specified") + "</td></tr>" +
                    "<tr><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0;'><strong>NIC Coordinator:</strong></td><td style='padding: 6px 12px; border-bottom: 1px solid #e2e8f0; color: #003366;'>" + (project.getNicCoordEmail() != null ? project.getNicCoordEmail() : "Not specified") + "</td></tr>" +
                    "<tr><td style='padding: 6px 12px;'><strong>NICSI Staff / Project Manager:</strong></td><td style='padding: 6px 12px; color: #003366;'>" + (project.getStaffEmailId() != null ? project.getStaffEmailId() : "info-nicsi@nic.in") + "</td></tr>" +
                    "</tbody></table>" +

                    "<div style='margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end;'>" +
                    "<div>" +
                    "<p style='margin: 0;'>With warm regards,</p>" +
                    "<div style='margin-top: 20px;'>" +
                    "<p style='margin: 0; font-weight: bold; color: #003366;'>Project Monitoring Division</p>" +
                    "<p style='margin: 0; font-size: 11px;'>National Informatics Centre Services Inc. (NICSI)</p>" +
                    "<p style='margin: 0; font-size: 11px; color: #64748b;'>An Enterprise of NIC under MeitY, Govt. of India</p>" +
                    "<div style='background: #f8fafc; padding: 10px 25px; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center;'>" +
                    "This is an official system-generated communication from NICSI Project Monitoring System (NPMS). For verification, quote Ref No: " + refNo +
                    "</div></div>";
        } else {
            // Default fallback if noticeType is unrecognized or empty
            title = "Official Communication [" + project.getProjectCode() + "]";
            toEmail = project.getUserEmail() != null ? project.getUserEmail() : (project.getHodEmail() != null ? project.getHodEmail() : "client@gov.in");
            htmlContent = letterhead +
                    "<div style='padding: 22px 25px; font-size: 12px; line-height: 1.7; color: #1e293b;'>" +
                    "<p style='margin-bottom: 14px;'><strong>To,</strong><br/>" +
                    "The Competent Authority / Head of Department,<br/>" +
                    "<strong style='color: #003366; font-size: 13px;'>" + project.getCustomerName() + "</strong></p>" +
                    "<p style='margin-bottom: 14px; background: #f1f5f9; padding: 10px 14px; border-left: 4px solid #003366; border-radius: 4px;'>" +
                    "<strong>Subject:</strong> Official Project Status Notice &mdash; " + project.getProjectCode() + "</p>" +
                    "<p>Greetings from NICSI Project Monitoring Division.</p>" +
                    "<p>This notice is issued regarding project <strong>" + project.getProjectName() + "</strong> (" + project.getProjectCode() + "). Total PO Allotted Amount: " + formatINR(poAmt) + " across " + noOfPo + " PO(s).</p>" +
                    "</div></div>";
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "title", title,
                "content", htmlContent,
                "toEmail", toEmail,
                "message", "Notice generated successfully."
        ));
    }

    @PostMapping("/{headerId}/dispatch-notice")
    public ResponseEntity<Map<String, Object>> dispatchNotice(
            Authentication authentication,
            @PathVariable Long headerId,
            @RequestBody Map<String, String> payload) {

        AccessScope scope = scopeResolver.resolve(authentication);
        ProjectList project = repo.findById(headerId).orElse(null);
        if (project == null) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Project not found"));
        }
        if (!scope.isUnrestricted()) {
            if (project.getPrjMgrId() == null || !scope.allowedPrjMgrIds().contains(project.getPrjMgrId())) {
                throw ForbiddenScopeException.forResource("this project's notices");
            }
        }

        String toEmail = payload.get("toEmail");
        String subject = payload.get("subject");
        String content = payload.get("content");

        if (toEmail == null || toEmail.isEmpty()) {
            // Fallback for testing as requested
            toEmail = "sixer3080@gmail.com";
        }

        try {
            emailService.sendHtmlMessage(toEmail, subject, content);
            return ResponseEntity.ok(Map.of("success", true, "message", "Email dispatched successfully."));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("success", false, "message", "Failed to dispatch email: " + e.getMessage()));
        }
    }

    /**
     * GET /api/v1/projects/{headerId}
     *
     * Returns a single project record for the Project 360° page.
     * Enforces the same RBAC scope as the list endpoint: a PM can only
     * fetch their own projects; MD sees all of their managed PMs' projects.
     */
    @GetMapping("/{headerId}")
    public ResponseEntity<Map<String, Object>> getProject(
            Authentication authentication,
            @PathVariable Long headerId) {

        AccessScope scope = scopeResolver.resolve(authentication);

        com.npms.core.entity.ProjectList project = repo.findById(headerId)
                .orElse(null);

        if (project == null) {
            return ResponseEntity.status(404).body(Map.of(
                    "success", false, "message", "Project not found."));
        }

        // Enforce RBAC: PM and MD can only see projects in their allowed scope
        if (!scope.isUnrestricted() && !scope.isPmc()) {
            List<Long> allowed = scope.allowedPrjMgrIds();
            if (allowed != null && !allowed.contains(project.getPrjMgrId())) {
                return ResponseEntity.status(403).body(Map.of(
                        "success", false, "message", "Access denied to this project."));
            }
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("headerId", project.getHeaderId());
        data.put("projectId", project.getProjectId());
        data.put("projectCode", project.getProjectCode());
        data.put("projectName", project.getProjectName());
        data.put("customerName", project.getCustomerName());
        data.put("prjMgrId", project.getPrjMgrId());
        data.put("prjType", project.getPrjType());
        data.put("projectCategory", project.getProjectCategory());
        data.put("amountReceived", project.getAmountReceived());
        data.put("poAmount", project.getPoAmount());
        data.put("totalAmountPaid", project.getTotalAmountPaid());
        data.put("totalInvoiceAmount", project.getTotalInvoiceAmount());
        data.put("totalTaxInvoiceAmount", project.getTotalTaxInvoiceAmount());
        data.put("prjBudgetNo", project.getPrjBudgetNo());
        data.put("noOfPo", project.getNoOfPo());
        data.put("noOfExpInvoice", project.getNoOfExpInvoice());
        data.put("noOfTaxInvoice", project.getNoOfTaxInvoice());
        data.put("nicsiCommission", project.getNicsiCommission());
        data.put("totalPenaltyAmt", project.getTotalPenaltyAmt());
        data.put("createdOn", project.getCreatedOn());
        data.put("userEmail", project.getUserEmail());
        data.put("mobileNumber", project.getMobileNumber());
        data.put("hodEmail", project.getHodEmail());
        data.put("nicCoordEmail", project.getNicCoordEmail());
        data.put("staffEmailId", project.getStaffEmailId());
        data.put("ministry", project.getMinistry());
        data.put("department", project.getDepartment());
        data.put("stateCode", project.getStateCode());

        return ResponseEntity.ok(Map.of("success", true, "data", data));
    }
}

