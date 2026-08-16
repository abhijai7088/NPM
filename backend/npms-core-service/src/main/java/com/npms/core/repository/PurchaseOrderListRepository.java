package com.npms.core.repository;

import com.npms.core.entity.PurchaseOrderList;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface PurchaseOrderListRepository extends JpaRepository<PurchaseOrderList, Long> {

    List<PurchaseOrderList> findByProjectNo(String projectNo);

    Page<PurchaseOrderList> findByProjectNoContainingIgnoreCase(String search, Pageable pageable);

    // RBAC-scoped variants (Project Manager sees only their own POs)
    Page<PurchaseOrderList> findByPrjMgrId(Long prjMgrId, Pageable pageable);

    Page<PurchaseOrderList> findByPrjMgrIdAndProjectNoContainingIgnoreCase(Long prjMgrId, String search, Pageable pageable);

    // MD-scoped variants (only provisioned Project Managers)
    Page<PurchaseOrderList> findByPrjMgrIdIn(java.util.List<Long> prjMgrIds, Pageable pageable);

    Page<PurchaseOrderList> findByPrjMgrIdInAndProjectNoContainingIgnoreCase(java.util.List<Long> prjMgrIds, String search, Pageable pageable);

    /**
     * Find projects with POs whose latest todate has passed (expired).
     */
    @Query("SELECT DISTINCT p.projectNo FROM PurchaseOrderList p " +
            "GROUP BY p.projectNo " +
            "HAVING MAX(p.todate) < :today")
    List<String> findExpiredProjectCodes(@Param("today") LocalDate today);

    /**
     * Find projects with POs expiring within N days.
     */
    @Query("SELECT DISTINCT p.projectNo FROM PurchaseOrderList p " +
            "GROUP BY p.projectNo " +
            "HAVING MAX(p.todate) BETWEEN :today AND :expiryDate")
    List<String> findExpiringSoonProjectCodes(
            @Param("today") LocalDate today,
            @Param("expiryDate") LocalDate expiryDate);

    /**
     * Get the latest PO end date for a given project.
     */
    @Query("SELECT MAX(p.todate) FROM PurchaseOrderList p WHERE p.projectNo = :projectNo")
    LocalDate findLatestEndDate(@Param("projectNo") String projectNo);
}
