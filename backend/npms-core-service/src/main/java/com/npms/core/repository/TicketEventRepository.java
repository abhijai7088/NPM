package com.npms.core.repository;

import com.npms.core.entity.TicketEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TicketEventRepository extends JpaRepository<TicketEvent, Long> {

    /** Full event history for a ticket, newest first. */
    List<TicketEvent> findByTicketIdOrderByEventAtDesc(Long ticketId);

    /** All events performed by a specific user. */
    List<TicketEvent> findByPerformedByOrderByEventAtDesc(String performedBy);
}
