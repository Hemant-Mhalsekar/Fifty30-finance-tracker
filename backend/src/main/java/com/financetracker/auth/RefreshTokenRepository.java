package com.financetracker.auth;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    // Also closes every grace period, so a just-rotated token cannot open a new session afterwards.
    @Modifying
    @Query("update RefreshToken t set t.revoked = true, t.graceUsed = true"
            + " where t.userId = :userId and (t.revoked = false or t.graceUsed = false)")
    int revokeAllByUserId(@Param("userId") UUID userId);

    // Like revokeIfActive, but records the rotation time that starts the grace period.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken t set t.revoked = true, t.rotatedAt = :now"
            + " where t.tokenHash = :hash and t.revoked = false and t.expiresAt > :now")
    int rotateIfActive(@Param("hash") String hash, @Param("now") OffsetDateTime now);

    // Single atomic UPDATE: a token rotated after :since can be presented once more (returns 1), never twice.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken t set t.graceUsed = true where t.tokenHash = :hash and t.revoked = true"
            + " and t.graceUsed = false and t.rotatedAt > :since and t.expiresAt > :now")
    int useGraceIfAllowed(@Param("hash") String hash, @Param("since") OffsetDateTime since,
            @Param("now") OffsetDateTime now);

    // Single atomic UPDATE: only one caller can flip an active token to revoked (returns 1), the rest get 0.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken t set t.revoked = true where t.tokenHash = :hash and t.revoked = false and t.expiresAt > :now")
    int revokeIfActive(@Param("hash") String hash, @Param("now") OffsetDateTime now);

    @Modifying
    @Query("update RefreshToken t set t.graceUsed = true where t.userId = :userId and t.graceUsed = false")
    int closeGrace(@Param("userId") UUID userId);

    // Bulk delete in one statement; returns the number of rows removed.
    @Modifying
    @Query("delete from RefreshToken t where t.expiresAt < :cutoff")
    int deleteExpiredBefore(@Param("cutoff") OffsetDateTime cutoff);
}
