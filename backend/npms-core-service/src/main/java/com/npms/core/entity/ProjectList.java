package com.npms.core.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "project_list", schema = "public")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectList {

    @Id
    @Column(name = "header_id")
    private Long headerId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "prj_mgr_id")
    private Long prjMgrId;

    @Column(name = "project_cd")
    private String projectCode;

    @Column(name = "prj_nm", columnDefinition = "TEXT")
    private String projectName;

    @Column(name = "customer_name", columnDefinition = "TEXT")
    private String customerName;

    @Column(name = "prj_budget_no")
    private BigDecimal prjBudgetNo;

    @Column(name = "amount_received")
    private BigDecimal amountReceived;

    @Column(name = "no_of_po")
    private Integer noOfPo;

    @Column(name = "po_amount")
    private BigDecimal poAmount;

    @Column(name = "no_of_inv_billdesk")
    private Integer noOfInvBilldesk;

    @Column(name = "no_of_exp_invocie")
    private Integer noOfExpInvoice;

    @Column(name = "total_invoice_amount")
    private BigDecimal totalInvoiceAmount;

    @Column(name = "total_amount_paid")
    private BigDecimal totalAmountPaid;

    @Column(name = "no_of_tax_invoice")
    private Integer noOfTaxInvoice;

    @Column(name = "total_tax_invocie_amount")
    private BigDecimal totalTaxInvoiceAmount;

    @Column(name = "project_abp")
    private BigDecimal projectAbp;

    @Column(name = "created_on")
    private LocalDate createdOn;

    @Column(name = "cust_id")
    private Long custId;

    @Column(name = "prj_type")
    private String prjType;

    @Column(name = "user_email", columnDefinition = "TEXT")
    private String userEmail;

    @Column(name = "mobile_number")
    private String mobileNumber;

    @Column(name = "hod_email", columnDefinition = "TEXT")
    private String hodEmail;
    

    @Column(name = "nic_cord_emailid", columnDefinition = "TEXT")
    private String nicCoordEmail;

    @Column(name = "staff_email_id", columnDefinition = "TEXT")
    private String staffEmailId;

    @Column(name = "ministry", columnDefinition = "TEXT")
    private String ministry;

    @Column(name = "department", columnDefinition = "TEXT")
    private String department;

    @Column(name = "project_category", columnDefinition = "TEXT")
    private String projectCategory;

    @Column(name = "state_code", columnDefinition = "TEXT")
    private String stateCode;

    // Generated Column in DB
    @Column(name = "nicsi_commission", insertable = false, updatable = false)
    private BigDecimal nicsiCommission;

    @Column(name = "total_penalty_amt")
    private BigDecimal totalPenaltyAmt;

    @Transient
    public BigDecimal getCommissionPercentage() {
        if (amountReceived == null || amountReceived.compareTo(BigDecimal.ZERO) == 0) return BigDecimal.ZERO;
        if (nicsiCommission == null) return BigDecimal.ZERO;
        return nicsiCommission.divide(amountReceived, 4, java.math.RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100));
    }

    @Transient
    public String getFinancialStatus() {
        if (nicsiCommission != null && nicsiCommission.compareTo(BigDecimal.ZERO) > 0) {
            return "PROFIT";
        }
        if (amountReceived != null && poAmount != null && amountReceived.compareTo(poAmount) < 0) {
            return "LOSS";
        }
        return "NEUTRAL";
    }

    // Explicit Getters for guaranteed compilation
    public Long getHeaderId() { return headerId; }
    public void setHeaderId(Long headerId) { this.headerId = headerId; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long projectId) { this.projectId = projectId; }
    public Long getPrjMgrId() { return prjMgrId; }
    public void setPrjMgrId(Long prjMgrId) { this.prjMgrId = prjMgrId; }
    public String getProjectCode() { return projectCode; }
    public void setProjectCode(String projectCode) { this.projectCode = projectCode; }
    public String getProjectName() { return projectName; }
    public void setProjectName(String projectName) { this.projectName = projectName; }
    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }
    public BigDecimal getPrjBudgetNo() { return prjBudgetNo; }
    public void setPrjBudgetNo(BigDecimal prjBudgetNo) { this.prjBudgetNo = prjBudgetNo; }
    public BigDecimal getAmountReceived() { return amountReceived; }
    public void setAmountReceived(BigDecimal amountReceived) { this.amountReceived = amountReceived; }
    public Integer getNoOfPo() { return noOfPo; }
    public void setNoOfPo(Integer noOfPo) { this.noOfPo = noOfPo; }
    public BigDecimal getPoAmount() { return poAmount; }
    public void setPoAmount(BigDecimal poAmount) { this.poAmount = poAmount; }
    public Integer getNoOfInvBilldesk() { return noOfInvBilldesk; }
    public void setNoOfInvBilldesk(Integer noOfInvBilldesk) { this.noOfInvBilldesk = noOfInvBilldesk; }
    public Integer getNoOfExpInvoice() { return noOfExpInvoice; }
    public void setNoOfExpInvoice(Integer noOfExpInvoice) { this.noOfExpInvoice = noOfExpInvoice; }
    public BigDecimal getTotalInvoiceAmount() { return totalInvoiceAmount; }
    public void setTotalInvoiceAmount(BigDecimal totalInvoiceAmount) { this.totalInvoiceAmount = totalInvoiceAmount; }
    public BigDecimal getTotalAmountPaid() { return totalAmountPaid; }
    public void setTotalAmountPaid(BigDecimal totalAmountPaid) { this.totalAmountPaid = totalAmountPaid; }
    public Integer getNoOfTaxInvoice() { return noOfTaxInvoice; }
    public void setNoOfTaxInvoice(Integer noOfTaxInvoice) { this.noOfTaxInvoice = noOfTaxInvoice; }
    public BigDecimal getTotalTaxInvoiceAmount() { return totalTaxInvoiceAmount; }
    public void setTotalTaxInvoiceAmount(BigDecimal totalTaxInvoiceAmount) { this.totalTaxInvoiceAmount = totalTaxInvoiceAmount; }
    public BigDecimal getProjectAbp() { return projectAbp; }
    public void setProjectAbp(BigDecimal projectAbp) { this.projectAbp = projectAbp; }
    public LocalDate getCreatedOn() { return createdOn; }
    public void setCreatedOn(LocalDate createdOn) { this.createdOn = createdOn; }
    public Long getCustId() { return custId; }
    public void setCustId(Long custId) { this.custId = custId; }
    public String getPrjType() { return prjType; }
    public void setPrjType(String prjType) { this.prjType = prjType; }
    public String getUserEmail() { return userEmail; }
    public void setUserEmail(String userEmail) { this.userEmail = userEmail; }
    public String getMobileNumber() { return mobileNumber; }
    public void setMobileNumber(String mobileNumber) { this.mobileNumber = mobileNumber; }
    public String getHodEmail() { return hodEmail; }
    public void setHodEmail(String hodEmail) { this.hodEmail = hodEmail; }
    public String getNicCoordEmail() { return nicCoordEmail; }
    public void setNicCoordEmail(String nicCoordEmail) { this.nicCoordEmail = nicCoordEmail; }
    public String getStaffEmailId() { return staffEmailId; }
    public void setStaffEmailId(String staffEmailId) { this.staffEmailId = staffEmailId; }
    public String getMinistry() { return ministry; }
    public void setMinistry(String ministry) { this.ministry = ministry; }
    public String getDepartment() { return department; }
    public void setDepartment(String department) { this.department = department; }
    public String getProjectCategory() { return projectCategory; }
    public void setProjectCategory(String projectCategory) { this.projectCategory = projectCategory; }
    public String getStateCode() { return stateCode; }
    public void setStateCode(String stateCode) { this.stateCode = stateCode; }
    public BigDecimal getNicsiCommission() { return nicsiCommission; }
    public void setNicsiCommission(BigDecimal nicsiCommission) { this.nicsiCommission = nicsiCommission; }
    public BigDecimal getTotalPenaltyAmt() { return totalPenaltyAmt; }
    public void setTotalPenaltyAmt(BigDecimal totalPenaltyAmt) { this.totalPenaltyAmt = totalPenaltyAmt; }
}
