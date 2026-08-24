package com.npms.core.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Entity mapping to nicsi_erp.tax_invoice_list table.
 * Contains Tax Invoice data from Oracle ERP (XX_NIC_PM_TAX_INV_LIST view).
 */
@Entity
@Table(name = "tax_invoice_list", schema = "public")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaxInvoiceList {

    @Id
    @Column(name = "header_id")
    private Long headerId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "prj_mgr_id")
    private Long prjMgrId;

    @Column(name = "cust_id")
    private Long custId;

    @Column(name = "cust_gstin_no")
    private String custGstinNo;

    @Column(name = "prj_gstn_no")
    private String prjGstnNo;

    @Column(name = "project_no")
    private String projectNo;

    @Column(name = "po_no")
    private String poNo;

    @Column(name = "ampono")
    private String ampono;

    @Column(name = "user_bill_no")
    private String userBillNo;

    @Column(name = "bill_date")
    private LocalDate billDate;

    @Column(name = "bill_status")
    private String billStatus;

    @Column(name = "billing_period_from")
    private String billingPeriodFrom;

    @Column(name = "billing_period_to")
    private String billingPeriodTo;

    @Column(name = "supp_inv_num")
    private String suppInvNum;

    @Column(name = "totalamount")
    private BigDecimal totalAmount;

    @Column(name = "bill_type")
    private String billType;

    @Column(name = "state_description")
    private String stateDescription;

    @Column(name = "irn_no", columnDefinition = "TEXT")
    private String irnNo;

    @Column(name = "created_date")
    private LocalDate createdDate;

    public Long getHeaderId() { return headerId; }
    public void setHeaderId(Long headerId) { this.headerId = headerId; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long projectId) { this.projectId = projectId; }
    public Long getPrjMgrId() { return prjMgrId; }
    public void setPrjMgrId(Long prjMgrId) { this.prjMgrId = prjMgrId; }
    public Long getCustId() { return custId; }
    public void setCustId(Long custId) { this.custId = custId; }
    public String getCustGstinNo() { return custGstinNo; }
    public void setCustGstinNo(String custGstinNo) { this.custGstinNo = custGstinNo; }
    public String getPrjGstnNo() { return prjGstnNo; }
    public void setPrjGstnNo(String prjGstnNo) { this.prjGstnNo = prjGstnNo; }
    public String getProjectNo() { return projectNo; }
    public void setProjectNo(String projectNo) { this.projectNo = projectNo; }
    public String getPoNo() { return poNo; }
    public void setPoNo(String poNo) { this.poNo = poNo; }
    public String getAmpono() { return ampono; }
    public void setAmpono(String ampono) { this.ampono = ampono; }
    public String getUserBillNo() { return userBillNo; }
    public void setUserBillNo(String userBillNo) { this.userBillNo = userBillNo; }
    public LocalDate getBillDate() { return billDate; }
    public void setBillDate(LocalDate billDate) { this.billDate = billDate; }
    public String getBillStatus() { return billStatus; }
    public void setBillStatus(String billStatus) { this.billStatus = billStatus; }
    public String getBillingPeriodFrom() { return billingPeriodFrom; }
    public void setBillingPeriodFrom(String billingPeriodFrom) { this.billingPeriodFrom = billingPeriodFrom; }
    public String getBillingPeriodTo() { return billingPeriodTo; }
    public void setBillingPeriodTo(String billingPeriodTo) { this.billingPeriodTo = billingPeriodTo; }
    public String getSuppInvNum() { return suppInvNum; }
    public void setSuppInvNum(String suppInvNum) { this.suppInvNum = suppInvNum; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
    public String getBillType() { return billType; }
    public void setBillType(String billType) { this.billType = billType; }
    public String getStateDescription() { return stateDescription; }
    public void setStateDescription(String stateDescription) { this.stateDescription = stateDescription; }
    public String getIrnNo() { return irnNo; }
    public void setIrnNo(String irnNo) { this.irnNo = irnNo; }
    public LocalDate getCreatedDate() { return createdDate; }
    public void setCreatedDate(LocalDate createdDate) { this.createdDate = createdDate; }
}
