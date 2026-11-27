package com.financetracker.notification;

import java.util.Optional;

// Used when the VAPID keys are not set: the app runs, notifications are simply unavailable.
public class DisabledPushSender implements PushSender {

    @Override
    public Delivery send(PushTarget target, PushMessage message) {
        return Delivery.FAILED;
    }

    @Override
    public Optional<String> publicKey() {
        return Optional.empty();
    }
}
