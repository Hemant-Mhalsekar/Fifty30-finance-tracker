package com.financetracker.ratelimit;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.TimeMeter;

// In-memory token buckets, one per key. Correct only while the backend runs as a single
// instance (true on Render's free plan); several instances would each count separately.
// Limits reset when the server restarts, which is acceptable for slowing down guessing.
@Component
public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);

    // Each key costs a few hundred bytes. Without a cap, an attacker sending a new fake IP with
    // every request could grow the map until the 512 MB instance runs out of memory.
    static final int DEFAULT_MAX_KEYS = 50_000;

    private record Entry(Bucket bucket, long capacity) {
    }

    private final ConcurrentMap<String, Entry> buckets = new ConcurrentHashMap<>();
    private final TimeMeter timeMeter;
    private final int maxKeys;

    @Autowired
    public RateLimiter(Clock clock) {
        this(clock, DEFAULT_MAX_KEYS);
    }

    RateLimiter(Clock clock, int maxKeys) {
        this.timeMeter = new ClockTimeMeter(clock);
        this.maxKeys = maxKeys;
    }

    /**
     * Takes one token from the bucket for {@code key}, creating it full if needed.
     * Tokens refill evenly: {@code capacity} per {@code period}.
     *
     * @param limitName short name for logs and errors, e.g. "login-ip"
     * @throws RateLimitExceededException when the bucket is empty
     */
    public void consume(String limitName, String key, long capacity, Duration period) {
        String fullKey = limitName + ':' + key;
        Entry entry = buckets.get(fullKey);
        if (entry == null) {
            if (buckets.size() >= maxKeys) {
                evictIdleBuckets();
                if (buckets.size() >= maxKeys) {
                    // Fail closed: refusing new keys is safer than running out of memory.
                    log.warn("Rate limiter is full; refusing new keys for limit {}", limitName);
                    throw new RateLimitExceededException(limitName, 60);
                }
            }
            entry = buckets.computeIfAbsent(fullKey, k -> new Entry(newBucket(capacity, period), capacity));
        }

        ConsumptionProbe probe = entry.bucket().tryConsumeAndReturnRemaining(1);
        if (!probe.isConsumed()) {
            long seconds = Math.max(1, (probe.getNanosToWaitForRefill() + 999_999_999L) / 1_000_000_000L);
            throw new RateLimitExceededException(limitName, seconds);
        }
    }

    // A full bucket behaves exactly like a missing one, so dropping it loses nothing.
    @Scheduled(fixedDelay = 10, timeUnit = TimeUnit.MINUTES)
    public int evictIdleBuckets() {
        int before = buckets.size();
        buckets.entrySet().removeIf(e -> e.getValue().bucket().getAvailableTokens() >= e.getValue().capacity());
        return before - buckets.size();
    }

    int size() {
        return buckets.size();
    }

    private Bucket newBucket(long capacity, Duration period) {
        return Bucket.builder()
                .addLimit(limit -> limit.capacity(capacity).refillGreedy(capacity, period))
                .withCustomTimePrecision(timeMeter)
                .build();
    }

    // Bucket4j time from the injected Clock, so tests can move time instead of sleeping.
    private record ClockTimeMeter(Clock clock) implements TimeMeter {

        @Override
        public long currentTimeNanos() {
            Instant now = clock.instant();
            return Math.addExact(Math.multiplyExact(now.getEpochSecond(), 1_000_000_000L), now.getNano());
        }

        @Override
        public boolean isWallClockBased() {
            return true;
        }
    }
}
