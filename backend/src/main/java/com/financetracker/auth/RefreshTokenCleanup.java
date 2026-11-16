package com.financetracker.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

// Every refresh adds a row, so without cleanup refresh_tokens only grows.
@Component
public class RefreshTokenCleanup {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenCleanup.class);

    // Revoked rows must outlive their token for reuse detection to work: presenting a revoked
    // token logs the user out everywhere, but only while the row still exists. Expired tokens
    // are useless to an attacker, so a week after expiry the row can go.
    static final Duration RETENTION_AFTER_EXPIRY = Duration.ofDays(7);

    private final RefreshTokenService refreshTokenService;
    private final Clock clock;

    public RefreshTokenCleanup(RefreshTokenService refreshTokenService, Clock clock) {
        this.refreshTokenService = refreshTokenService;
        this.clock = clock;
    }

    // Render's free instance sleeps after 15 idle minutes, so a fixed time of day (say 3 a.m.)
    // would usually find it asleep. Instead: shortly after every start, then every 6 hours awake.
    @Scheduled(initialDelay = 5, fixedDelay = 360, timeUnit = TimeUnit.MINUTES)
    public int deleteExpiredTokens() {
        int deleted = refreshTokenService.deleteExpiredBefore(OffsetDateTime.now(clock).minus(RETENTION_AFTER_EXPIRY));
        if (deleted > 0) {
            log.info("Deleted {} expired refresh tokens", deleted);
        }
        return deleted;
    }
}
