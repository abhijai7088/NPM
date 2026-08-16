package com.npms.core.specification;

import com.npms.core.entity.ProjectList;
import com.npms.core.entity.PurchaseOrderList;
import com.npms.core.entity.State;
import org.springframework.data.jpa.domain.Specification;
import jakarta.persistence.criteria.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Specification for advanced project filtering including PO-based expiry detection.
 * Expiry is determined by the latest PO TODATE for a project (from purchase_order_list).
 *
 * ── Vendor billing / NICSI cash-hold business rules ─────────────────────────
 * See docs/PROJECT_FILTERS_AND_NICSI_HOLD.md for the full glossary and worked
 * numeric examples. Summary of the fields involved (all from nicsi_erp.project_list):
 *   amountReceived   — funds NICSI has received from the client/govt for this project
 *   poAmount          — total value committed to the vendor via Purchase Order(s)
 *   totalAmountPaid   — amount NICSI has actually disbursed to the vendor so far
 *   noOfInvBilldesk   — number of bills the vendor has submitted into NICSI's Bill Desk
 *
 * "Bills Not Paid To Vendor": the vendor HAS submitted at least one bill
 * (noOfInvBilldesk > 0) but NICSI has not yet fully paid it (poAmount > totalAmountPaid).
 *
 * "Vendor Has Not Submitted Bill": there is an active PO (noOfPo > 0) but the
 * vendor has submitted zero bills so far (noOfInvBilldesk is null or 0).
 *
 * "NICSI Hold < 20%": NICSI Hold Amount = amountReceived − totalAmountPaid (the
 * cash NICSI is currently sitting on). NICSI Hold % = NICSI Hold Amount ÷ poAmount.
 * When this ratio drops below 20% AND there is still a vendor amount pending
 * (poAmount > totalAmountPaid), NICSI's cash cushion is too thin to safely cover
 * the remaining vendor commitment — it should request additional funds from the
 * client/government before more vendor bills fall due.
 */
public class ProjectListSpecification {

    /**
     * @param prjMgrId    single-PM scope (a PM sees only their own projects)
     * @param prjMgrIdIn  restrict to a set of PM ids (e.g. only PMs the MD has provisioned);
     *                    an empty list forces an empty result
     */
    public static Specification<ProjectList> advancedSearch(
            String search, String expiryStatus, String expiryDays,
            Integer commissionRate, String financialStatus, Boolean hasVendorPendingBills,
            Boolean vendorBillNotSubmitted, Boolean nicsiHoldLessThan20,
            String projectManager, String state,
            String ministry, String department, String projectCategory,
            Long prjMgrId, List<Long> prjMgrIdIn,
            Boolean hasVendorBilled, Boolean hasExpBills, Boolean hasPOs, Boolean hasInvoiced) {

        return (root, query, criteriaBuilder) -> {
            List<Predicate> predicates = new ArrayList<>();

            // RBAC scope: a Project Manager only ever sees their own projects.
            // MD / Super Admin pass null here and see the whole organisation.
            if (prjMgrId != null) {
                predicates.add(criteriaBuilder.equal(root.get("prjMgrId"), prjMgrId));
            }

            // Provisioned-PM scope (used by the MD view): restrict to the set of
            // PM ids that have been provisioned as logins. Empty set => no results.
            if (prjMgrIdIn != null) {
                if (prjMgrIdIn.isEmpty()) {
                    predicates.add(criteriaBuilder.disjunction()); // always false
                } else {
                    predicates.add(root.get("prjMgrId").in(prjMgrIdIn));
                }
            }

            if (search != null && !search.isEmpty()) {
                if ("N/A".equalsIgnoreCase(search) || "NA".equalsIgnoreCase(search)) {
                    predicates.add(criteriaBuilder.or(
                            criteriaBuilder.isNull(root.get("projectName")),
                            criteriaBuilder.isNull(root.get("customerName")),
                            criteriaBuilder.isNull(root.get("projectCode")),
                            criteriaBuilder.equal(root.get("projectName"), ""),
                            criteriaBuilder.equal(root.get("customerName"), ""),
                            criteriaBuilder.equal(root.get("projectCode"), "")
                    ));
                } else {
                    String likePattern = "%" + search.toLowerCase() + "%";
                    predicates.add(criteriaBuilder.or(
                            criteriaBuilder.like(criteriaBuilder.lower(root.get("projectName")), likePattern),
                            criteriaBuilder.like(criteriaBuilder.lower(root.get("projectCode")), likePattern),
                            criteriaBuilder.like(criteriaBuilder.lower(root.get("customerName")), likePattern)
                    ));
                }
            }

            // Expiry filter: uses PO todate from purchase_order_list via subquery
            if (expiryStatus != null && !expiryStatus.isEmpty()) {
                LocalDate today = LocalDate.now();

                // Subquery: get the MAX(todate) from purchase_order_list for each project
                Subquery<LocalDate> poSubquery = query.subquery(LocalDate.class);
                Root<PurchaseOrderList> poRoot = poSubquery.from(PurchaseOrderList.class);
                poSubquery.select(criteriaBuilder.greatest(poRoot.<LocalDate>get("todate")));
                poSubquery.where(criteriaBuilder.equal(poRoot.get("projectNo"), root.get("projectCode")));

                if ("EXPIRED".equalsIgnoreCase(expiryStatus)) {
                    // Project is expired if the latest PO end date is before today
                    predicates.add(criteriaBuilder.lessThan(poSubquery, today));
                } else if ("EXPIRING_SOON".equalsIgnoreCase(expiryStatus)) {
                    int days = 90;
                    try {
                        if (expiryDays != null && !expiryDays.isEmpty()) {
                            days = Integer.parseInt(expiryDays);
                        }
                    } catch (NumberFormatException ignored) {}
                    LocalDate expiryThreshold = today.plusDays(days);
                    predicates.add(criteriaBuilder.between(poSubquery, today, expiryThreshold));
                } else if ("ACTIVE".equalsIgnoreCase(expiryStatus)) {
                    int days = 90;
                    try {
                        if (expiryDays != null && !expiryDays.isEmpty()) {
                            days = Integer.parseInt(expiryDays);
                        }
                    } catch (NumberFormatException ignored) {}
                    LocalDate expiryThreshold = today.plusDays(days);
                    predicates.add(criteriaBuilder.and(
                            criteriaBuilder.greaterThan(root.get("noOfPo"), 0),
                            criteriaBuilder.greaterThan(poSubquery, expiryThreshold)
                    ));
                } else if ("NO_PO".equalsIgnoreCase(expiryStatus)) {
                    predicates.add(criteriaBuilder.or(
                            criteriaBuilder.isNull(root.get("noOfPo")),
                            criteriaBuilder.equal(root.get("noOfPo"), 0)
                    ));
                }
            }

            // Financial Status: cleared / partial / pending / Profit / Loss
            if (financialStatus != null && !financialStatus.isEmpty()) {
                if (financialStatus.equalsIgnoreCase("cleared")) {
                    predicates.add(criteriaBuilder.and(
                            criteriaBuilder.greaterThan(root.get("poAmount"), BigDecimal.ZERO),
                            criteriaBuilder.greaterThanOrEqualTo(root.get("totalAmountPaid"), root.get("poAmount"))
                    ));
                } else if (financialStatus.equalsIgnoreCase("partial")) {
                    predicates.add(criteriaBuilder.and(
                            criteriaBuilder.greaterThan(root.get("totalAmountPaid"), BigDecimal.ZERO),
                            criteriaBuilder.lessThan(root.get("totalAmountPaid"), root.get("poAmount"))
                    ));
                } else if (financialStatus.equalsIgnoreCase("pending")) {
                    predicates.add(criteriaBuilder.or(
                            criteriaBuilder.isNull(root.get("totalAmountPaid")),
                            criteriaBuilder.equal(root.get("totalAmountPaid"), BigDecimal.ZERO)
                    ));
                } else if (financialStatus.equalsIgnoreCase("PROFIT")) {
                    predicates.add(criteriaBuilder.greaterThan(root.get("nicsiCommission"), BigDecimal.ZERO));
                } else if (financialStatus.equalsIgnoreCase("LOSS")) {
                    predicates.add(criteriaBuilder.lessThan(root.get("amountReceived"), root.get("poAmount")));
                }
            }

            // Pipeline Filter Flags
            if (hasVendorBilled != null && hasVendorBilled) {
                predicates.add(criteriaBuilder.greaterThan(root.get("noOfInvBilldesk"), 0));
            }
            if (hasExpBills != null && hasExpBills) {
                predicates.add(criteriaBuilder.greaterThan(root.get("noOfExpInvoice"), 0));
            }
            if (hasPOs != null && hasPOs) {
                predicates.add(criteriaBuilder.greaterThan(root.get("noOfPo"), 0));
            }
            if (hasInvoiced != null && hasInvoiced) {
                predicates.add(criteriaBuilder.greaterThan(root.get("totalInvoiceAmount"), BigDecimal.ZERO));
            }

            // "Bills Not Paid To Vendor": the vendor HAS submitted at least one bill
            // (noOfInvBilldesk > 0) but NICSI has not fully paid the committed PO amount yet.
            // (Previously this only checked poAmount > totalAmountPaid, which also matched
            // projects where the vendor had not billed at all — that case is now its own filter.)
            if (hasVendorPendingBills != null && hasVendorPendingBills) {
                predicates.add(criteriaBuilder.and(
                        criteriaBuilder.greaterThan(root.get("noOfInvBilldesk"), 0),
                        criteriaBuilder.greaterThan(root.get("poAmount"), root.get("totalAmountPaid"))
                ));
            }

            // "Vendor Has Not Submitted Bill": an active PO exists but the vendor has
            // not submitted any Bill Desk invoice against it yet.
            if (vendorBillNotSubmitted != null && vendorBillNotSubmitted) {
                predicates.add(criteriaBuilder.and(
                        criteriaBuilder.greaterThan(root.get("noOfPo"), 0),
                        criteriaBuilder.or(
                                criteriaBuilder.isNull(root.get("noOfInvBilldesk")),
                                criteriaBuilder.equal(root.get("noOfInvBilldesk"), 0)
                        )
                ));
            }

            // "NICSI Hold < 20%": NICSI's retained cash cushion (amountReceived - totalAmountPaid)
            // is less than 20% of the total vendor commitment (poAmount), while a vendor amount
            // is still outstanding. This signals NICSI should request more funds from the
            // client/government before the remaining vendor bills fall due.
            // See docs/PROJECT_FILTERS_AND_NICSI_HOLD.md for worked examples.
            if (nicsiHoldLessThan20 != null && nicsiHoldLessThan20) {
                Expression<BigDecimal> holdAmount = criteriaBuilder.diff(
                        criteriaBuilder.coalesce(root.get("amountReceived"), BigDecimal.ZERO),
                        criteriaBuilder.coalesce(root.get("totalAmountPaid"), BigDecimal.ZERO)
                );
                Expression<BigDecimal> holdRatio = criteriaBuilder.quot(holdAmount, root.get("poAmount")).as(BigDecimal.class);

                predicates.add(criteriaBuilder.and(
                        criteriaBuilder.greaterThan(root.get("poAmount"), BigDecimal.ZERO),
                        criteriaBuilder.greaterThan(root.get("poAmount"), root.get("totalAmountPaid")),
                        criteriaBuilder.lessThan(holdRatio, BigDecimal.valueOf(0.20))
                ));
            }

            // Project Manager
            if (projectManager != null && !projectManager.isEmpty()) {
                String pm = "%" + projectManager.toLowerCase() + "%";
                predicates.add(criteriaBuilder.or(
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("hodEmail")), pm),
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("userEmail")), pm),
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("nicCoordEmail")), pm),
                    criteriaBuilder.like(criteriaBuilder.lower(root.get("staffEmailId")), pm)
                ));
            }

            // State (Normalized lookup against master.states via State entity)
            if (state != null && !state.isEmpty()) {
                if ("N/A".equalsIgnoreCase(state) || "NA".equalsIgnoreCase(state)) {
                    predicates.add(criteriaBuilder.or(
                        criteriaBuilder.isNull(root.get("stateCode")),
                        criteriaBuilder.equal(root.get("stateCode"), ""),
                        criteriaBuilder.equal(criteriaBuilder.lower(root.get("stateCode")), "n/a")
                    ));
                } else {
                    String st = "%" + state.toLowerCase() + "%";
                    Subquery<String> stateSub = query.subquery(String.class);
                    Root<State> stateRoot = stateSub.from(State.class);
                    stateSub.select(stateRoot.get("stateCode"));
                    stateSub.where(criteriaBuilder.or(
                        criteriaBuilder.like(criteriaBuilder.lower(stateRoot.get("stateName")), st),
                        criteriaBuilder.like(criteriaBuilder.lower(stateRoot.get("stateCode")), st)
                    ));
                    predicates.add(criteriaBuilder.or(
                        root.get("stateCode").in(stateSub),
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("stateCode")), st)
                    ));
                }
            }

            // Ministry, Department, Project Category
            if (ministry != null && !ministry.isEmpty()) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("ministry")), "%" + ministry.toLowerCase() + "%"));
            }
            if (department != null && !department.isEmpty()) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("department")), "%" + department.toLowerCase() + "%"));
            }
            if (projectCategory != null && !projectCategory.isEmpty()) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("projectCategory")), "%" + projectCategory.toLowerCase() + "%"));
            }

            // Commission Rate filter (approximation using commission/received ratio)
            if (commissionRate != null) {
                if (commissionRate == 0) {
                    Expression<BigDecimal> comm = criteriaBuilder.coalesce(root.get("nicsiCommission"), BigDecimal.ZERO);
                    Expression<BigDecimal> rcvd = criteriaBuilder.coalesce(root.get("amountReceived"), BigDecimal.ZERO);
                    predicates.add(criteriaBuilder.or(
                        criteriaBuilder.equal(comm, BigDecimal.ZERO),
                        criteriaBuilder.equal(rcvd, BigDecimal.ZERO),
                        criteriaBuilder.lessThanOrEqualTo(
                            criteriaBuilder.quot(comm, rcvd).as(BigDecimal.class),
                            BigDecimal.valueOf(0.015)
                        )
                    ));
                } else {
                    BigDecimal rate = BigDecimal.valueOf(commissionRate).divide(BigDecimal.valueOf(100));
                    BigDecimal lowerBound = rate.subtract(BigDecimal.valueOf(0.015));
                    BigDecimal upperBound = rate.add(BigDecimal.valueOf(0.015));

                    predicates.add(criteriaBuilder.and(
                            criteriaBuilder.greaterThan(root.get("amountReceived"), BigDecimal.ZERO),
                            criteriaBuilder.greaterThanOrEqualTo(
                                    criteriaBuilder.quot(root.get("nicsiCommission"), root.get("amountReceived")).as(BigDecimal.class),
                                    lowerBound
                            ),
                            criteriaBuilder.lessThanOrEqualTo(
                                    criteriaBuilder.quot(root.get("nicsiCommission"), root.get("amountReceived")).as(BigDecimal.class),
                                    upperBound
                            )
                    ));
                }
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }
}
