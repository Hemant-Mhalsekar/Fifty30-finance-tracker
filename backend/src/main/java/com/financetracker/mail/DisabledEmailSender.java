package com.financetracker.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

// Used when no provider is configured (local runs without a key, tests). Logs that nothing was
// sent, never the recipient or the content: the content can contain a password reset link.
public class DisabledEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(DisabledEmailSender.class);

    @Override
    public void send(Email email) {
        log.warn("Email not sent because no email provider is configured (subject: {})", email.subject());
    }
}
