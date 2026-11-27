package com.financetracker.notification;

import java.time.Clock;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import tools.jackson.databind.json.JsonMapper;

@Configuration
public class NotificationConfig {

    // Without both keys the app runs and simply offers no notifications. Keys that are set but
    // wrong stop the app at startup, like a missing JWT_SECRET, instead of failing every push.
    @Bean
    PushSender pushSender(
            JsonMapper jsonMapper,
            Clock clock,
            @Value("${app.push.vapid-public-key}") String publicKey,
            @Value("${app.push.vapid-private-key}") String privateKey,
            @Value("${app.push.vapid-subject}") String subject) {
        if (publicKey.isBlank() || privateKey.isBlank()) {
            return new DisabledPushSender();
        }
        return new WebPushSender(VapidKeys.parse(publicKey, privateKey, subject), jsonMapper, clock);
    }
}
