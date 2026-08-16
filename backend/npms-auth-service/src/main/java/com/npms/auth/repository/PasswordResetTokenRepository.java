package com.npms.auth.repository;

import com.npms.auth.entity.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, UUID> {

    /** Find the latest unused token for a user. */
    Optional<PasswordResetToken> findTopByUserIdAndIsUsedFalseOrderByCreatedAtDesc(UUID userId);

    /** Invalidate every prior OTP before issuing a replacement. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update PasswordResetToken t set t.isUsed = true where t.user.id = :userId and t.isUsed = false")
    int markAllUnusedAsUsed(@Param("userId") UUID userId);
}
