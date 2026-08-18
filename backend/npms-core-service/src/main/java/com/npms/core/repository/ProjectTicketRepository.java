package com.npms.core.repository;

import com.npms.core.entity.ProjectTicket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ProjectTicketRepository extends JpaRepository<ProjectTicket, Long> {

    Optional<ProjectTicket> findByTicketCode(String ticketCode);

    List<ProjectTicket> findByHeaderIdOrderByCreatedAtDesc(Long headerId);

    List<ProjectTicket> findByAssignedToOrderByCreatedAtDesc(String assignedTo);

    List<ProjectTicket> findByStatusOrderByCreatedAtDesc(String status);

    List<ProjectTicket> findByAssignedToAndStatusOrderBySlaDeadlineAsc(
            String assignedTo, String status);

    @Query("SELECT t FROM ProjectTicket t WHERE t.headerId IN :headerIds ORDER BY t.createdAt DESC")
    List<ProjectTicket> findByHeaderIdIn(@Param("headerIds") List<Long> headerIds);

    /** Open/active tickets for a specific project. */
    @Query("SELECT t FROM ProjectTicket t WHERE t.headerId = :headerId " +
           "AND t.status NOT IN ('CLOSED', 'RESOLVED') ORDER BY t.priority DESC, t.createdAt ASC")
    List<ProjectTicket> findActiveByHeaderId(@Param("headerId") Long headerId);

    /** Overdue open tickets (past SLA deadline). */
    @Query("SELECT t FROM ProjectTicket t WHERE t.slaDeadline < CURRENT_TIMESTAMP " +
           "AND t.status NOT IN ('RESOLVED', 'CLOSED') ORDER BY t.slaDeadline ASC")
    List<ProjectTicket> findOverdueTickets();

    /** Tickets escalated (escalated_to is not null). */
    @Query("SELECT t FROM ProjectTicket t WHERE t.escalatedTo IS NOT NULL " +
           "AND t.status NOT IN ('CLOSED') ORDER BY t.priority DESC, t.createdAt ASC")
    List<ProjectTicket> findEscalatedTickets();

    /** Count open tickets by priority for PMC heatmap. */
    @Query("SELECT t.priority, COUNT(t) FROM ProjectTicket t " +
           "WHERE t.status NOT IN ('RESOLVED','CLOSED') GROUP BY t.priority")
    List<Object[]> countOpenByPriority();

    @Query("SELECT t FROM ProjectTicket t WHERE t.headerId IN :headerIds " +
           "AND (:status IS NULL OR t.status = :status) " +
           "AND (:priority IS NULL OR t.priority = :priority) " +
           "ORDER BY t.priority DESC, t.createdAt DESC")
    List<ProjectTicket> searchTickets(
            @Param("headerIds") List<Long> headerIds,
            @Param("status") String status,
            @Param("priority") String priority);
}
