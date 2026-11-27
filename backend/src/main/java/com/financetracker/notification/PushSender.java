package com.financetracker.notification;

import java.util.Optional;

/** Sends one push to one browser. Never throws: the result says what happened. */
public interface PushSender {

    enum Delivery {
        /** Accepted by the push service. */
        DELIVERED,
        /** The subscription no longer exists (HTTP 404 or 410): forget it. */
        GONE,
        /** Anything else (service down, rate limited, bad request): try again next time. */
        FAILED
    }

    Delivery send(PushTarget target, PushMessage message);

    /** The VAPID public key browsers subscribe with; empty when notifications are not set up. */
    Optional<String> publicKey();
}
