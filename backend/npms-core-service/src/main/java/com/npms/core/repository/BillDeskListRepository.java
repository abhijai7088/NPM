package com.npms.core.repository;

import com.npms.core.entity.BillDeskList;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BillDeskListRepository extends JpaRepository<BillDeskList, Long> {

    List<BillDeskList> findByProjectNo(String projectNo);

    Page<BillDeskList> findByProjectNoContainingIgnoreCase(String search, Pageable pageable);

    // RBAC-scoped variants
    Page<BillDeskList> findByPrjMgrId(Long prjMgrId, Pageable pageable);

    Page<BillDeskList> findByPrjMgrIdAndProjectNoContainingIgnoreCase(Long prjMgrId, String search, Pageable pageable);

    // MD-scoped variants (only provisioned Project Managers)
    Page<BillDeskList> findByPrjMgrIdIn(java.util.List<Long> prjMgrIds, Pageable pageable);

    Page<BillDeskList> findByPrjMgrIdInAndProjectNoContainingIgnoreCase(java.util.List<Long> prjMgrIds, String search, Pageable pageable);
}
