package com.financetracker.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import io.sentry.Sentry;
import jakarta.annotation.PreDestroy;

// Starts Sentry when SENTRY_DSN is set; otherwise every Sentry call in the app is a no-op.
// Errors only: no performance tracing, and no personal data (IP address, user, cookies or headers
// with credentials). Request bodies are never attached because nothing here adds them.
@Configuration
public class SentryConfig {

    private static final Logger log = LoggerFactory.getLogger(SentryConfig.class);

    private final boolean enabled;

    public SentryConfig(
            @Value("${app.sentry.dsn:}") String dsn,
            @Value("${app.sentry.environment:production}") String environment) {
        this.enabled = !dsn.isBlank();
        if (!enabled) {
            log.info("Sentry is off (no SENTRY_DSN)");
            return;
        }
        Sentry.init(options -> {
            options.setDsn(dsn);
            options.setEnvironment(environment);
            options.setSendDefaultPii(false);
        });
        log.info("Sentry is on");
    }

    // Sends anything still queued before the app stops (Render restarts on every deploy).
    @PreDestroy
    void close() {
        if (enabled) {
            Sentry.close();
        }
    }
}
