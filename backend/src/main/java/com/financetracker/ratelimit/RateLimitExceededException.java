package com.financetracker.ratelimit;

// Mapped to 429 with a Retry-After header by ApiExceptionHandler.
public class RateLimitExceededException extends RuntimeException {

    private final String limitName;
    private final long retryAfterSeconds;

    public RateLimitExceededException(String limitName, long retryAfterSeconds) {
        super("Rate limit exceeded: " + limitName);
        this.limitName = limitName;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    // The limit's name only (e.g. "login-email"), never the IP or email behind it.
    public String getLimitName() {
        return limitName;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
