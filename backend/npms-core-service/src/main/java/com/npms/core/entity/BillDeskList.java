package com.npms.core.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Entity mapping to nicsi_erp.bill_desk_list table.
 * Contains BillDesk invoice data from Oracle ERP (XX_NIC_PM_BILL_DSK_LIST view).
 */
@Entity
@Table(name = "bill_desk_list", schema = "public")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BillDeskList {

    @Id
    @Column(name = "header_id")
    private Long headerId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "prj_mgr_id")
    private Long prjMgrId;

    @Column(name = "project_no")
    private String projectNo;

    @Column(name = "final_po_no")
    private String finalPoNo;

    @Column(name = "bill_month")
    private BigDecimal billMonth;

    @Column(name = "vendor_id")
    private Long vendorId;

    @Column(name = "vendor_name")
    private String vendorName;

    @Column(name = "invoice_no")
    private Long invoiceNo;

    @Column(name = "invoice_date")
    private LocalDate invoiceDate;

    @Column(name = "received_date")
    private LocalDate receivedDate;

    @Column(name = "invoice_amount")
    private Long invoiceAmount;

    @Column(name = "invoice_num")
    private Long invoiceNum;

    @Column(name = "invoice_amount_bk")
    private Long invoiceAmountBk;

    @Column(name = "amount_paid")
    private Long amountPaid;

    @Column(name = "invoice_status")
    private Long invoiceStatus;

    @Column(name = "objection_remarks", columnDefinition = "TEXT")
    private String objectionRemarks;

    @Column(name = "status")
    private String status;

    @Column(name = "created_date")
    private LocalDate createdDate;

    public Long getHeaderId() { return headerId; }
    public void setHeaderId(Long headerId) { this.headerId = headerId; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long projectId) { this.projectId = projectId; }
    public Long getPrjMgrId() { return prjMgrId; }
    public void setPrjMgrId(Long prjMgrId) { this.prjMgrId = prjMgrId; }
    public String getProjectNo() { return projectNo; }
    public void setProjectNo(String projectNo) { this.projectNo = projectNo; }
    public String getFinalPoNo() { return finalPoNo; }
    public void setFinalPoNo(String finalPoNo) { this.finalPoNo = finalPoNo; }
    public BigDecimal getBillMonth() { return billMonth; }
    public void setBillMonth(BigDecimal billMonth) { this.billMonth = billMonth; }
    public Long getVendorId() { return vendorId; }
    public void setVendorId(Long vendorId) { this.vendorId = vendorId; }
    public String getVendorName() { return vendorName; }
    public void setVendorName(String vendorName) { this.vendorName = vendorName; }
    public Long getInvoiceNo() { return invoiceNo; }
    public void setInvoiceNo(Long invoiceNo) { this.invoiceNo = invoiceNo; }
    public LocalDate getInvoiceDate() { return invoiceDate; }
    public void setInvoiceDate(LocalDate invoiceDate) { this.invoiceDate = invoiceDate; }
    public LocalDate getReceivedDate() { return receivedDate; }
    public void setReceivedDate(LocalDate receivedDate) { this.receivedDate = receivedDate; }
    public Long getInvoiceAmount() { return invoiceAmount; }
    public void setInvoiceAmount(Long invoiceAmount) { this.invoiceAmount = invoiceAmount; }
    public Long getInvoiceNum() { return invoiceNum; }
    public void setInvoiceNum(Long invoiceNum) { this.invoiceNum = invoiceNum; }
    public Long getInvoiceAmountBk() { return invoiceAmountBk; }
    public void setInvoiceAmountBk(Long invoiceAmountBk) { this.invoiceAmountBk = invoiceAmountBk; }
    public Long getAmountPaid() { return amountPaid; }
    public void setAmountPaid(Long amountPaid) { this.amountPaid = amountPaid; }
    public Long getInvoiceStatus() { return invoiceStatus; }
    public void setInvoiceStatus(Long invoiceStatus) { this.invoiceStatus = invoiceStatus; }
    public String getObjectionRemarks() { return objectionRemarks; }
    public void setObjectionRemarks(String objectionRemarks) { this.objectionRemarks = objectionRemarks; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDate getCreatedDate() { return createdDate; }
    public void setCreatedDate(LocalDate createdDate) { this.createdDate = createdDate; }
}
