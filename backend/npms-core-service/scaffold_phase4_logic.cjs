const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-core-service/src/main/java/com/npms/core';

const files = {
  'service/PurchaseOrderService.java': `package com.npms.core.service;

import com.npms.core.entity.PurchaseOrder;
import com.npms.core.entity.Project;
import com.npms.core.repository.ProjectRepository;
import com.npms.core.exception.NpmsBaseException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;
import java.time.LocalDate;

@Service
public class PurchaseOrderService {
    
    private final ProjectRepository projectRepository;

    public PurchaseOrderService(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    @Transactional
    public PurchaseOrder createPurchaseOrder(PurchaseOrder po) {
        Project project = projectRepository.findById(po.getProjectId())
            .orElseThrow(() -> new NpmsBaseException("PROJECT_NOT_FOUND", "Project not found"));
            
        if (!"APPROVED".equals(project.getStatus().name())) {
            throw new NpmsBaseException("INVALID_PROJECT_STATUS", "Project must be APPROVED to create a PO");
        }

        // Mock Budget Guard: poAmount + existing <= approvedBudget
        if (po.getPoAmount() > project.getApprovedBudget()) {
            throw new NpmsBaseException("BUDGET_EXCEEDED", "Exceeds remaining budget");
        }

        if (po.getVendorGstin() != null && !po.getVendorGstin().matches("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")) {
            throw new NpmsBaseException("INVALID_GSTIN", "Invalid GSTIN format");
        }

        po.setTotalAmount(po.getPoAmount() + po.getTaxAmount());
        po.setStatus("DRAFT");
        // Save PO logic here
        return po;
    }

    @Transactional
    public void recordGrn(UUID poId, LocalDate receivedDate) {
        // Find PO
        // Validate PO is APPROVED
        // Validate receivedDate >= poDate
        // Update PO status to GOODS_RECEIVED
    }
}`,

  'service/InvoiceService.java': `package com.npms.core.service;

import com.npms.core.entity.Invoice;
import com.npms.core.entity.PurchaseOrder;
import com.npms.core.exception.NpmsBaseException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service
public class InvoiceService {

    @Transactional
    public Invoice createInvoice(Invoice invoice, PurchaseOrder po) {
        if (!"GOODS_RECEIVED".equals(po.getStatus())) {
            throw new NpmsBaseException("THREE_WAY_MATCH_FAILED", "Goods receipt must be recorded before creating invoice");
        }

        if (invoice.getInvoiceAmount() > po.getPoAmount()) {
            throw new NpmsBaseException("OVER_INVOICED", "Invoice amount cannot exceed PO amount");
        }

        if (invoice.getTdsAmount() < 0 || invoice.getTdsAmount() > (invoice.getInvoiceAmount() * 0.3)) {
            throw new NpmsBaseException("INVALID_TDS", "TDS must be between 0 and 30% of invoice amount");
        }

        invoice.setNetPayable(invoice.getInvoiceAmount() + invoice.getTaxAmount() - invoice.getTdsAmount());
        invoice.setStatus("DRAFT");
        // Save invoice logic here
        return invoice;
    }
}`,

  'service/PaymentService.java': `package com.npms.core.service;

import com.npms.core.entity.Invoice;
import com.npms.core.entity.Project;
import com.npms.core.repository.ProjectRepository;
import com.npms.core.exception.NpmsBaseException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentService {
    
    private final ProjectRepository projectRepository;

    public PaymentService(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    @Transactional
    public void initiatePayment(Invoice invoice, Project project) {
        if (!"APPROVED".equals(invoice.getStatus())) {
            throw new NpmsBaseException("INVALID_INVOICE_STATUS", "Invoice must be APPROVED to initiate payment");
        }

        // Prevent Duplicate Payments logic
        
        invoice.setStatus("PAYMENT_INITIATED");
        // Atomic budget update
        project.setApprovedBudget(project.getApprovedBudget() - invoice.getNetPayable()); 
        projectRepository.save(project);
    }
}`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Phase 4 Business Logic Services scaffolded.');
