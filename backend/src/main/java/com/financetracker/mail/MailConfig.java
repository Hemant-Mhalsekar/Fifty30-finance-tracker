package com.financetracker.mail;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import tools.jackson.databind.json.JsonMapper;

@Configuration
public class MailConfig {

    // Without BREVO_API_KEY and MAIL_FROM_ADDRESS the app still starts; it just cannot send email.
    @Bean
    EmailSender emailSender(
            JsonMapper jsonMapper,
            @Value("${app.mail.brevo-api-key}") String apiKey,
            @Value("${app.mail.from-address}") String fromAddress,
            @Value("${app.mail.from-name}") String fromName) {
        if (apiKey.isBlank() || fromAddress.isBlank()) {
            return new DisabledEmailSender();
        }
        return new BrevoEmailSender(jsonMapper, apiKey, fromAddress, fromName);
    }
}
