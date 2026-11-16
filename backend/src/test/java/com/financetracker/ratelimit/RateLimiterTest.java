package com.financetracker.ratelimit;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RateLimiterTest {

    private static final Duration WINDOW = Duration.ofMinutes(15);

    private MutableClock clock;
    private RateLimiter limiter;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-11-16T10:00:00Z"));
        limiter = new RateLimiter(clock, 100);
    }

    @Test
    void allowsUpToCapacityThenRejectsWithTheWaitForOneToken() {
        for (int i = 0; i < 5; i++) {
            limiter.consume("login-ip", "203.0.113.1", 5, WINDOW);
        }
        RateLimitExceededException ex = assertThrows(RateLimitExceededException.class,
                () -> limiter.consume("login-ip", "203.0.113.1", 5, WINDOW));

        // 5 tokens per 15 minutes refill one every 3 minutes.
        assertEquals(180, ex.getRetryAfterSeconds());
        assertEquals("login-ip", ex.getLimitName());
    }

    @Test
    void refillsOverTimeWithoutSleeping() {
        for (int i = 0; i < 5; i++) {
            limiter.consume("login-ip", "203.0.113.1", 5, WINDOW);
        }
        clock.advance(Duration.ofMinutes(2).plusSeconds(59));
        assertThrows(RateLimitExceededException.class,
                () -> limiter.consume("login-ip", "203.0.113.1", 5, WINDOW));

        clock.advance(Duration.ofSeconds(1));
        assertDoesNotThrow(() -> limiter.consume("login-ip", "203.0.113.1", 5, WINDOW));
        assertThrows(RateLimitExceededException.class,
                () -> limiter.consume("login-ip", "203.0.113.1", 5, WINDOW));
    }

    @Test
    void keysAndLimitNamesAreIndependent() {
        limiter.consume("login-ip", "203.0.113.1", 1, WINDOW);
        assertThrows(RateLimitExceededException.class,
                () -> limiter.consume("login-ip", "203.0.113.1", 1, WINDOW));

        assertDoesNotThrow(() -> limiter.consume("login-ip", "203.0.113.2", 1, WINDOW));
        // Same key text under another limit is a different bucket.
        assertDoesNotThrow(() -> limiter.consume("register-ip", "203.0.113.1", 1, WINDOW));
    }

    @Test
    void evictionDropsOnlyFullBuckets() {
        limiter.consume("login-ip", "a", 5, WINDOW);
        limiter.consume("login-ip", "b", 5, WINDOW);
        assertEquals(0, limiter.evictIdleBuckets());

        // After a full window both are full again; nothing is lost by dropping them.
        clock.advance(WINDOW);
        limiter.consume("login-ip", "c", 5, WINDOW);
        assertEquals(2, limiter.evictIdleBuckets());
        assertEquals(1, limiter.size());
    }

    @Test
    void refusesNewKeysWhenFullOfActiveBucketsInsteadOfGrowingForever() {
        RateLimiter small = new RateLimiter(clock, 3);
        for (String key : new String[] {"a", "b", "c"}) {
            small.consume("login-ip", key, 5, WINDOW);
        }
        RateLimitExceededException ex = assertThrows(RateLimitExceededException.class,
                () -> small.consume("login-ip", "d", 5, WINDOW));
        assertEquals(60, ex.getRetryAfterSeconds());
        // Existing keys keep working.
        assertDoesNotThrow(() -> small.consume("login-ip", "a", 5, WINDOW));

        // Once old buckets refill they are evicted and new keys are accepted again.
        clock.advance(WINDOW);
        assertDoesNotThrow(() -> small.consume("login-ip", "d", 5, WINDOW));
        assertEquals(1, small.size());
    }
}
