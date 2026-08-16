package com.npms.core.repository;

import com.npms.core.entity.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AppUserRepository extends JpaRepository<AppUser, String> {

    List<AppUser> findByRole(String role);

    List<AppUser> findByCreatedBy(String createdBy);

    /** PMs attached to a specific Managing Director. */
    List<AppUser> findByRoleAndManagedBy(String role, String managedBy);

    boolean existsByPrjMgrId(Long prjMgrId);

    List<AppUser> findAllByOrderByCreatedAtAsc();

    @Query("SELECT u FROM AppUser u WHERE LOWER(u.username) = LOWER(:identifier) OR LOWER(u.email) = LOWER(:identifier)")
    Optional<AppUser> findByUsernameOrEmail(@Param("identifier") String identifier);
}
