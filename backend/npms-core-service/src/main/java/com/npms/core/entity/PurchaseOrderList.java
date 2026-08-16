package com.npms.core.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Entity mapping to nicsi_erp.purchase_order_list table.
 * Contains PO data from Oracle ERP (XX_NIC_PM_PO_LIST view).
 */
@Entity
@Table(name = "purchase_order_list", schema = "public")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseOrderList {

    @Id
    @Column(name = "header_id")
    private Long headerId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "project_no")
    private String projectNo;

    @Column(name = "prj_mgr_id")
    private Long prjMgrId;

    @Column(name = "vendor_id")
    private Long vendorId;

    @Column(name = "vendor_name")
    private String vendorName;

    @Column(name = "final_po_no")
    private String finalPoNo;

    @Column(name = "po_date")
    private LocalDate poDate;

    @Column(name = "frdate")
    private LocalDate frdate;

    @Column(name = "todate")
    private LocalDate todate;

    @Column(name = "total")
    private BigDecimal total;

    @Column(name = "approval_status")
    private String approvalStatus;

    @Column(name = "created_date")
    private LocalDate createdDate;

    /**
     * Checks whether this PO has expired (todate is before today).
     */
    @Transient
    public boolean isExpired() {
        return todate != null && todate.isBefore(LocalDate.now());
    }

    /**
     * Checks whether this PO is expiring within given number of days.
     */
    @Transient
    public boolean isExpiringSoon(int days) {
        if (todate == null) return false;
        LocalDate today = LocalDate.now();
        return !todate.isBefore(today) && todate.isBefore(today.plusDays(days));
    }

    public Long getHeaderId() { return headerId; }
    public void setHeaderId(Long headerId) { this.headerId = headerId; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long projectId) { this.projectId = projectId; }
    public String getProjectNo() { return projectNo; }
    public void setProjectNo(String projectNo) { this.projectNo = projectNo; }
    public Long getPrjMgrId() { return prjMgrId; }
    public void setPrjMgrId(Long prjMgrId) { this.prjMgrId = prjMgrId; }
    public Long getVendorId() { return vendorId; }
    public void setVendorId(Long vendorId) { this.vendorId = vendorId; }
    public String getVendorName() { return vendorName; }
    public void setVendorName(String vendorName) { this.vendorName = vendorName; }
    public String getFinalPoNo() { return finalPoNo; }
    public void setFinalPoNo(String finalPoNo) { this.finalPoNo = finalPoNo; }
    public LocalDate getPoDate() { return poDate; }
    public void setPoDate(LocalDate poDate) { this.poDate = poDate; }
    public LocalDate getFrdate() { return frdate; }
    public void setFrdate(LocalDate frdate) { this.frdate = frdate; }
    public LocalDate getTodate() { return todate; }
    public void setTodate(LocalDate todate) { this.todate = todate; }
    public BigDecimal getTotal() { return total; }
    public void setTotal(BigDecimal total) { this.total = total; }
    public String getApprovalStatus() { return approvalStatus; }
    public void setApprovalStatus(String approvalStatus) { this.approvalStatus = approvalStatus; }
    public LocalDate getCreatedDate() { return createdDate; }
    public void setCreatedDate(LocalDate createdDate) { this.createdDate = createdDate; }
}
