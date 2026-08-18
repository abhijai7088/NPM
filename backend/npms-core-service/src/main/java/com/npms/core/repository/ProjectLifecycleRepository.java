package com.npms.core.repository;

import com.npms.core.entity.ProjectLifecycle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProjectLifecycleRepository extends JpaRepository<ProjectLifecycle, Long> {

    Optional<ProjectLifecycle> findByHeaderId(Long headerId);

    List<ProjectLifecycle> findByAssignedPmId(Long pmId);

    List<ProjectLifecycle> findByCurrentStage(String stage);

    @Query("SELECT pl FROM ProjectLifecycle pl WHERE pl.assignedPmId IN :pmIds")
    List<ProjectLifecycle> findByAssignedPmIdIn(@Param("pmIds") List<Long> pmIds);

    /** Overdue projects: sla_deadline is in the past and stage is not CLOSED. */
    @Query("SELECT pl FROM ProjectLifecycle pl " +
           "WHERE pl.slaDeadline < CURRENT_TIMESTAMP " +
           "AND pl.currentStage <> 'CLOSED'")
    List<ProjectLifecycle> findOverdueProjects();

    /** Projects currently on hold (hold_reason is not null/blank). */
    @Query("SELECT pl FROM ProjectLifecycle pl WHERE pl.holdReason IS NOT NULL AND pl.holdReason <> ''")
    List<ProjectLifecycle> findProjectsOnHold();

    /** Count by stage for dashboard KPI cards. */
    @Query("SELECT pl.currentStage, COUNT(pl) FROM ProjectLifecycle pl GROUP BY pl.currentStage")
    List<Object[]> countByStage();
}
