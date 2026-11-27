package com.financetracker.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefreshTokenService {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);

    public static final long LIFETIME_DAYS = 30;

    // How long a rotated token may be presented once more. Long enough for a retry after a lost
    // response or a second tab, short enough that a stolen old token is still caught as reuse.
    public static final Duration REUSE_GRACE = Duration.ofMinutes(2);

    private final SecureRandom secureRandom = new SecureRandom();
    private final RefreshTokenRepository repository;
    private final Clock clock;

    public RefreshTokenService(RefreshTokenRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /** Result of a successful rotation: the owner and the new raw token (for the cookie). */
    public record Rotated(UUID userId, String token) {
    }

    /** Creates and stores a new refresh token. Returns the raw token; only its hash is stored. */
    @Transactional
    public String issue(UUID userId) {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        repository.save(new RefreshToken(userId, hash(rawToken), OffsetDateTime.now(clock).plusDays(LIFETIME_DAYS)));
        return rawToken;
    }

    /**
     * Revokes the presented token and issues a new one. Returns empty if the token is unknown,
     * expired or revoked. It returns instead of throwing so the transaction commits and the
     * "revoke all" on reuse detection is not rolled back.
     * Ownership of the token is decided only by conditional UPDATEs (rotateIfActive, useGraceIfAllowed),
     * so two simultaneous requests with the same token cannot both take the same path.
     *
     * Grace: a token rotated less than REUSE_GRACE ago may be presented ONCE more and gets its own new
     * token. This covers a refresh whose response never arrived (the browser still holds the old cookie)
     * and two tabs refreshing at the same moment. A third use, a use after the grace period, or any use
     * after "revoke all" (logout everywhere, password reset, deletion) is treated as theft.
     */
    @Transactional
    public Optional<Rotated> rotate(String rawToken) {
        String hash = hash(rawToken);
        OffsetDateTime now = OffsetDateTime.now(clock);

        if (repository.rotateIfActive(hash, now) == 1
                || repository.useGraceIfAllowed(hash, now.minus(REUSE_GRACE), now) == 1) {
            UUID userId = repository.findByTokenHash(hash).orElseThrow().getUserId();
            return Optional.of(new Rotated(userId, issue(userId)));
        }

        // Not usable: unknown, expired, or revoked. Only the last case is reuse.
        Optional<RefreshToken> found = repository.findByTokenHash(hash);
        if (found.isPresent() && found.get().isRevoked()) {
            // A revoked token was used again: assume it was stolen and end all of this user's sessions.
            UUID userId = found.get().getUserId();
            repository.revokeAllByUserId(userId);
            log.warn("Refresh token reuse detected for user {}; all refresh tokens revoked", userId);
        }
        return Optional.empty();
    }

    /**
     * Revokes the token if it exists and is still valid. Does nothing otherwise.
     * Also closes the grace period of the user's recently rotated tokens, so the token this one
     * replaced cannot open a new session after logging out.
     */
    @Transactional
    public void revoke(String rawToken) {
        String hash = hash(rawToken);
        if (repository.revokeIfActive(hash, OffsetDateTime.now(clock)) == 1) {
            repository.findByTokenHash(hash).ifPresent(token -> repository.closeGrace(token.getUserId()));
        }
    }

    /** Deletes tokens that expired before the cutoff, revoked or not. Returns how many were deleted. */
    @Transactional
    public int deleteExpiredBefore(OffsetDateTime cutoff) {
        return repository.deleteExpiredBefore(cutoff);
    }

    private static String hash(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is required on every Java platform.
            throw new IllegalStateException(e);
        }
    }
}
