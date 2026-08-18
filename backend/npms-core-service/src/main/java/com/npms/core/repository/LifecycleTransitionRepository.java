package com.npms.core.repository;

import com.npms.core.entity.LifecycleTransition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LifecycleTransitionRepository extends JpaRepository<LifecycleTransition, Long> {

    /** Full transition history for a project, newest first. */
    List<LifecycleTransition> findByHeaderIdOrderByTransitionedAtDesc(Long headerId);

    /** All transitions performed by or acting-as a specific user. */
    List<LifecycleTransition> findByPerformedByOrActingAsOrderByTransitionedAtDesc(
            String performedBy, String actingAs);
}
