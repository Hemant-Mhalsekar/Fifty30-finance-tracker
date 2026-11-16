package com.financetracker.auth;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface PasswordResetTokenRepository extends Repository<PasswordResetToken, UUID> {

    PasswordResetToken saveAndFlush(PasswordResetToken token);

    Optional<PasswordResetToken> findByTokenHash(String tokenHash);

    // A new request replaces older links, so only the newest email works.
    @Modifying(flushAutomatically = true)
    @Query("update PasswordResetToken t set t.usedAt = :now where t.userId = :userId and t.usedAt is null")
    int invalidateAllForUser(@Param("userId") UUID userId, @Param("now") OffsetDateTime now);

    // Single atomic UPDATE: of two simultaneous uses of one link, only one gets 1.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update PasswordResetToken t set t.usedAt = :now "
            + "where t.tokenHash = :hash and t.usedAt is null and t.expiresAt > :now")
    int consumeIfActive(@Param("hash") String hash, @Param("now") OffsetDateTime now);

    @Modifying
    @Query("delete from PasswordResetToken t where t.expiresAt < :cutoff")
    int deleteExpiredBefore(@Param("cutoff") OffsetDateTime cutoff);
}
