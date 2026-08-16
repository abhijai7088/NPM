# Project Filters & NICSI Hold — Business Logic Reference

This document explains, in plain terms, exactly what each Project Registry
filter means, which database fields it reads, and how the NICSI Hold /
vendor-billing calculations work — with worked numeric examples so the logic
is auditable, not just implemented.

Source of truth for the calculations: `ProjectListSpecification.java`
(query-level filtering) and `ProjectListController.java` (per-row computed
fields returned to the frontend). If you change the business rule, update
both places and this document together.

---

## 1. Field glossary (from `nicsi_erp.project_list`)

| Field (DB column) | Java field | Official Executive Report Header | Meaning |
|---|---|---|---|
| `project_cd` | `projectCode` | **Project Code** | Unique NICSI project identification code. |
| `customer_name` | `customerName` | **Department / Customer** | Name of the purchasing user department or client entity. |
| `amount_received` | `amountReceived` | **Project Funds Received** | Funds NICSI has actually received from the client/government for this project. |
| `po_amount` | `poAmount` | **Total PO Value** | Total value NICSI has committed to the vendor via Purchase Order(s) — what NICSI owes the vendor in total. |
| `total_amount_paid` | `totalAmountPaid` | **Amount Paid** | Amount NICSI has actually disbursed to the vendor so far. |
| `no_of_po` | `noOfPo` | **Total POs** | Number of Purchase Orders raised for this project. |
| `no_of_inv_billdesk` | `noOfInvBilldesk` | **Bills Submitted** | Number of bills the **vendor has submitted** into NICSI's Bill Desk against this project's PO(s). |
| `no_of_exp_invocie` | `noOfExpInvoice` | **Expected Bills** | Number of those Bill Desk bills that have been **fully processed/approved** as expenditure. |
| `total_invoice_amount` | `totalInvoiceAmount` | **Invoice Value Submitted** | Sum of vendor invoice values submitted for this project. |
| `no_of_tax_invoice` | `noOfTaxInvoice` | **Tax Invoices Raised** | Number of GST tax invoices raised for user department billing. |
| `total_tax_invocie_amount` | `totalTaxInvoiceAmount` | **Tax Invoice Value** | Aggregate value of GST tax invoices raised. |
| `project_abp` | `projectAbp` | **Available Project Balance** | Remaining unallocated project balance. |
| `final_po_no` | `finalPoNo` | **PO Number** | Unique Purchase Order reference identifier. |
| `po_date` | `poDate` | **PO Issue Date** | Date Purchase Order was issued. |
| `frdate` | `frdate` | **PO Valid From** | Validity start date of the Purchase Order. |
| `todate` | `todate` | **PO Valid Until** | Validity end date of the Purchase Order. |
| `total` | `total` | **PO Amount** | Total monetary value of an individual Purchase Order. |
| `total_penalty_amt` | `totalPenaltyAmt` | **Penalty Deductions** | Total penalty amount deducted from vendor invoices. |
| `nicsi_commission` | `nicsiCommission` | **NICSI Service Charge** | `GREATEST(0, amount_received - (po_amount - total_penalty_amt))` — DB-generated column; NICSI's retained service charge, including vendor fines. |

Two commonly confused amounts:
- **Vendor Amount Pending** = `(poAmount − totalPenaltyAmt) − totalAmountPaid` (clamped to ≥ 0). This is what NICSI still owes the vendor after deducting any penalties.
- **NICSI Hold Amount** = `amountReceived − totalAmountPaid`. This is the cash NICSI is currently sitting on (received from client, not yet paid out to vendor).

---

## 2. Filter definitions

### 2.1 "Bills Not Paid To Vendor" (`hasVendorPendingBills`)

**Plain meaning:** the vendor has already submitted at least one bill, but
NICSI has not fully paid the vendor for the PO yet.

**Condition:**
```
noOfInvBilldesk > 0
AND (poAmount - totalPenaltyAmt) > totalAmountPaid
```

**Why both conditions matter:** checking only `(poAmount - totalPenaltyAmt) > totalAmountPaid`
(the old, incorrect behavior) also matched projects where the vendor had
never submitted a bill at all — that is a completely different situation
(see 2.2) and needs a different notice.

**Worked example:**
- Project X: `poAmount = ₹1,00,000`, `totalAmountPaid = ₹60,000`, `noOfInvBilldesk = 3`
- Vendor has billed (3 bills exist) and NICSI still owes `₹1,00,000 − ₹60,000 = ₹40,000`.
- **Matches this filter.** → Action: "Send Notice to Vendor (Pending Bills)" — chase NICSI's own accounts team to release the ₹40,000 that's already billed.

### 2.2 "Vendor Has Not Submitted Bill" (`vendorBillNotSubmitted`)

**Plain meaning:** there's an active PO, but the vendor hasn't sent NICSI any
bill at all yet — nothing to pay because nothing has been claimed.

**Condition:**
```
noOfPo > 0
AND (noOfInvBilldesk IS NULL OR noOfInvBilldesk = 0)
```

**Worked example:**
- Project Y: `noOfPo = 1`, `poAmount = ₹50,000`, `totalAmountPaid = ₹0`, `noOfInvBilldesk = 0`
- A PO for ₹50,000 was issued, but the vendor has submitted zero bills.
- **Matches this filter.** → Action: "Remind Vendor to Submit Bill" — a reminder notice, not a payment-chasing notice, because there's nothing pending on NICSI's side yet.

### 2.3 NICSI Hold — `nicsiHoldAmount`, `nicsiHoldPercentage`, `nicsiHoldLessThan20`

**Business scenario this models:** NICSI receives project funds from the
client/government up front (or in tranches), then pays the vendor as work
progresses and bills come in. The money NICSI is holding between receiving
it and paying it out is the "hold." If that hold shrinks to a small fraction
of what's still owed to the vendor, NICSI risks not having enough cash on
hand to pay the vendor when the remaining bills arrive — at that point NICSI
should proactively request more funds from the client/government, rather
than waiting until it's short.

**Formulas:**
```
Effective PO Amount   = poAmount - totalPenaltyAmt
NICSI Hold Amount     = amountReceived − totalAmountPaid
NICSI Hold Percentage = NICSI Hold Amount ÷ Effective PO Amount × 100
```

**"NICSI Hold < 20%" filter condition:**
```
Effective PO Amount > 0
AND Effective PO Amount > totalAmountPaid        (there is still a vendor amount pending)
AND (NICSI Hold Amount ÷ Effective PO Amount) < 0.20
```

The pending-vendor-amount condition matters: if the vendor has already been
paid in full, a low "hold percentage" is irrelevant — there's no upcoming
vendor payment to worry about running short on.

**Worked example — hold is healthy (no action needed):**
- `amountReceived = ₹5,00,000`, `totalAmountPaid = ₹2,00,000`, `poAmount = ₹4,50,000`
- NICSI Hold Amount = `₹5,00,000 − ₹2,00,000 = ₹3,00,000`
- NICSI Hold % = `₹3,00,000 ÷ ₹4,50,000 = 66.7%`
- 66.7% ≥ 20% → **does not match the filter.** NICSI has plenty of cash cushion relative to what's still owed to the vendor (`₹4,50,000 − ₹2,00,000 = ₹2,50,000` pending).

**Worked example — hold is thin (fund request needed):**
- `amountReceived = ₹1,00,000`, `totalAmountPaid = ₹80,000`, `poAmount = ₹95,000`
- NICSI Hold Amount = `₹1,00,000 − ₹80,000 = ₹20,000`
- NICSI Hold % = `₹20,000 ÷ ₹95,000 = 21.1%`
- 21.1% ≥ 20% → does not match (close, but still just above the threshold).

**Worked example — hold below threshold:**
- `amountReceived = ₹1,00,000`, `totalAmountPaid = ₹85,000`, `poAmount = ₹95,000`
- NICSI Hold Amount = `₹1,00,000 − ₹85,000 = ₹15,000`
- NICSI Hold % = `₹15,000 ÷ ₹95,000 = 15.8%`
- Vendor amount pending = `₹95,000 − ₹85,000 = ₹10,000` (> 0)
- 15.8% < 20% AND vendor amount pending > 0 → **matches the filter.** → Action: "Request Govt/Client (Low NICSI Hold)" — ask the client/government to release more funds before the remaining ₹10,000 vendor bill comes due, since NICSI is only holding ₹15,000 against it.

---

## 3. Dynamic notice recommendations

The backend computes three boolean recommendation flags per project so the
"1-Click Notices" panel only shows buttons that are actually relevant —
this avoids the UI offering an action that doesn't apply to the project's
real state.

| Flag | True when | Notice shown |
|---|---|---|
| `recommendVendorReminder` | `vendorBillNotSubmitted` is true (2.2) | "Remind Vendor to Submit Bill" |
| `recommendVendorPaymentNotice` | `billsNotPaidToVendor` is true (2.1) | "Send Notice to Vendor (Pending Bills)" |
| `recommendGovtFundRequest` | `nicsiHoldBelow20` is true (2.3) | "Request Govt/Client (Low NICSI Hold)" |

If none of the three flags are true, the panel shows a message explaining
that no notice is currently required, instead of offering buttons that
would generate a misleading letter.

---

## 4. Other filters (unchanged, listed for completeness)

| Filter | Meaning | Fields used |
|---|---|---|
| Search | Case-insensitive substring match on name, code, or customer | `projectName`, `projectCode`, `customerName` |
| Project Manager / Assigned To | Substring match across the four email fields recorded per project | `hodEmail`, `userEmail`, `nicCoordEmail`, `staffEmailId` |
| State / Region | Normalized lookup against the exact `state_code` in `master.states`. The 2-letter state code is extracted from `PROJECT_CD`. | `stateCode`, `State` entity |
| Ministry / Department / Category | Case-insensitive substring match against the respective text fields. | `ministry`, `department`, `projectCategory` |
| NICSI Service Charge Rate | Matches projects whose commission-to-receipt ratio is within ±1.5 points of the selected tier (5/7/9%) | `nicsiCommission`, `amountReceived` |
| Financial Status | `PROFIT` = commission > 0; `LOSS` = amount received < PO amount | `nicsiCommission`, `amountReceived`, `poAmount` |
| Project Expiry | `EXPIRED` = latest PO end date is before today; `EXPIRING_SOON` = latest PO end date falls within the next N days (default 30) | `purchase_order_list.todate`, matched by `projectCode = projectNo` |


