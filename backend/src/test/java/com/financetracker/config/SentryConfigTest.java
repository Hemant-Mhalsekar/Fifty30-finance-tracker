package com.financetracker.config;

import static org.junit.jupiter.api.Assertions.assertFalse;

import org.junit.jupiter.api.Test;

import io.sentry.Sentry;

class SentryConfigTest {

    @Test
    void withoutADsnSentryStaysOffAndCapturingIsHarmless() {
        new SentryConfig("", "test").close();
        assertFalse(Sentry.isEnabled());
        // The exception handler calls this on every unexpected error; it must not throw when off.
        Sentry.captureException(new IllegalStateException("not sent"));
    }
}
