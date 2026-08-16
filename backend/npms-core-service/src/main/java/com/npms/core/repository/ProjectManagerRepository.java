package com.npms.core.repository;

import com.npms.core.entity.ProjectManager;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProjectManagerRepository extends JpaRepository<ProjectManager, Long> {
    List<ProjectManager> findByIsActiveTrue();
}
