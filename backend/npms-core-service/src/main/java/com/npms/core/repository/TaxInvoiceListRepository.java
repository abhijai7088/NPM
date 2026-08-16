package com.npms.core.repository;

import com.npms.core.entity.TaxInvoiceList;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TaxInvoiceListRepository extends JpaRepository<TaxInvoiceList, Long> {

    List<TaxInvoiceList> findByProjectNo(String projectNo);

    Page<TaxInvoiceList> findByProjectNoContainingIgnoreCase(String search, Pageable pageable);

    // RBAC-scoped variants
    Page<TaxInvoiceList> findByPrjMgrId(Long prjMgrId, Pageable pageable);

    Page<TaxInvoiceList> findByPrjMgrIdAndProjectNoContainingIgnoreCase(Long prjMgrId, String search, Pageable pageable);

    // MD-scoped variants (only provisioned Project Managers)
    Page<TaxInvoiceList> findByPrjMgrIdIn(java.util.List<Long> prjMgrIds, Pageable pageable);

    Page<TaxInvoiceList> findByPrjMgrIdInAndProjectNoContainingIgnoreCase(java.util.List<Long> prjMgrIds, String search, Pageable pageable);
}
