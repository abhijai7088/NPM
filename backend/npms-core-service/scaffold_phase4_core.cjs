const fs = require('fs');
const path = require('path');

const baseDir = 'c:/knowledge/Confidential/NICSI/npms/backend/npms-core-service/src/main/java/com/npms/core';

const files = {
  'entity/PurchaseOrder.java': `package com.npms.core.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "purchase_orders", schema = "npms")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseOrder {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @Column(name = "project_id")
    private UUID projectId;
    
    @Column(name = "po_number", unique = true)
    private String poNumber;
    
    private String vendorName;
    private String vendorGstin;
    
    private Double poAmount;
    private Double taxAmount;
    private Double totalAmount;
    
    private LocalDate poDate;
    private LocalDate deliveryDate;
    
    private String status; // DRAFT, SUBMITTED, APPROVED, REJECTED, GOODS_RECEIVED, PAID
    
    @Version
    private Long version;
}`,

  'entity/Invoice.java': `package com.npms.core.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "invoices", schema = "npms")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Invoice {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    
    @Column(name = "po_id")
    private UUID poId;
    
    @Column(name = "invoice_number", unique = true)
    private String invoiceNumber;
    
    private String vendorInvoiceNumber;
    private LocalDate invoiceDate;
    
    private Double invoiceAmount;
    private Double taxAmount;
    private Double tdsAmount;
    private Double netPayable;
    
    private String status; // DRAFT, VERIFIED, APPROVED, PAYMENT_INITIATED, PAID
}`,

  'controller/PurchaseOrderController.java': `package com.npms.core.controller;

import com.npms.core.entity.PurchaseOrder;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.UUID;
import java.util.List;

@RestController
@RequestMapping("/api/v1/pos")
public class PurchaseOrderController {

    @PostMapping
    @PreAuthorize("hasAnyAuthority('FINANCE_OFFICER', 'MINISTRY_ADMIN', 'SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> createPO(@RequestBody PurchaseOrder po) {
        // Validation: Project budget, GSTIN format, dates
        po.setTotalAmount(po.getPoAmount() + po.getTaxAmount());
        po.setPoNumber("PO-MOD-2026-0001");
        po.setStatus("DRAFT");
        return ResponseEntity.status(201).body(Map.of("success", true, "data", po, "message", "PO Created"));
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getPOs() {
        return ResponseEntity.ok(Map.of("success", true, "data", List.of(), "message", "Fetched POs"));
    }

    @PostMapping("/{poId}/grn")
    public ResponseEntity<Map<String, Object>> recordGrn(@PathVariable UUID poId, @RequestBody Map<String, Object> req) {
        return ResponseEntity.ok(Map.of("success", true, "message", "GRN Recorded"));
    }
}`,

  'controller/InvoiceController.java': `package com.npms.core.controller;

import com.npms.core.entity.Invoice;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.UUID;
import java.util.List;

@RestController
@RequestMapping("/api/v1/invoices")
public class InvoiceController {

    @PostMapping
    @PreAuthorize("hasAnyAuthority('FINANCE_OFFICER', 'MINISTRY_ADMIN', 'SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> createInvoice(@RequestBody Invoice invoice) {
        // Three-way match logic
        invoice.setNetPayable(invoice.getInvoiceAmount() + invoice.getTaxAmount() - invoice.getTdsAmount());
        invoice.setInvoiceNumber("INV-MOD-2026-0001");
        invoice.setStatus("DRAFT");
        return ResponseEntity.status(201).body(Map.of("success", true, "data", invoice, "message", "Invoice Created"));
    }

    @PostMapping("/{id}/verify")
    public ResponseEntity<Map<String, Object>> verifyInvoice(@PathVariable UUID id) {
        return ResponseEntity.ok(Map.of("success", true, "message", "Invoice Verified"));
    }
}`,

  'controller/PaymentController.java': `package com.npms.core.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payments")
public class PaymentController {

    @PostMapping
    @PreAuthorize("hasAnyAuthority('FINANCE_OFFICER', 'MINISTRY_ADMIN', 'SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> initiatePayment(@RequestBody Map<String, Object> req) {
        // Validation and status updates
        return ResponseEntity.status(201).body(Map.of("success", true, "message", "Payment Initiated"));
    }

    @PostMapping("/{id}/confirm")
    public ResponseEntity<Map<String, Object>> confirmPayment(@PathVariable UUID id) {
        return ResponseEntity.ok(Map.of("success", true, "message", "Payment Confirmed"));
    }
}`
};

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(baseDir, name), content);
}

console.log('Phase 4 Core Finance API scaffolded.');
