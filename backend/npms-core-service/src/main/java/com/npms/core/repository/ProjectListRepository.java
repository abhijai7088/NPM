package com.npms.core.repository;

import com.npms.core.entity.ProjectList;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProjectListRepository extends JpaRepository<ProjectList, Long>, JpaSpecificationExecutor<ProjectList> {

    /**
     * Portfolio aggregation grouped by project manager.
     * Columns: prj_mgr_id, project_count, total_received, total_commission,
     *          total_po, total_paid, total_abp
     */
    @Query(value = """
            SELECT p.prj_mgr_id AS prjMgrId,
                   COUNT(*) AS projectCount,
                   COALESCE(SUM(p.amount_received), 0) AS totalReceived,
                   COALESCE(SUM(p.nicsi_commission), 0) AS totalCommission,
                   COALESCE(SUM(p.po_amount), 0) AS totalPo,
                   COALESCE(SUM(p.total_amount_paid), 0) AS totalPaid,
                   COALESCE(SUM(p.project_abp), 0) AS totalAbp,
                   COALESCE(SUM(GREATEST(COALESCE(p.po_amount,0) - COALESCE(p.total_amount_paid,0), 0)), 0) AS totalVendorPending
            FROM nicsi_erp.project_list p
            GROUP BY p.prj_mgr_id
            """, nativeQuery = true)
    List<Object[]> aggregatePortfolioByManager();
}
