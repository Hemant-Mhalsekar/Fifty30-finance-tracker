package com.financetracker.notification;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// Written only by PushSubscriptionRepository's native upsert; read to send.
@Entity
@Table(name = "push_subscriptions")
public class PushSubscription {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String endpoint;

    @Column(nullable = false)
    private String p256dh;

    @Column(nullable = false)
    private String auth;

    @Column(name = "subscribed_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime subscribedAt;

    protected PushSubscription() {
        // required by JPA
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getEndpoint() {
        return endpoint;
    }

    public OffsetDateTime getSubscribedAt() {
        return subscribedAt;
    }

    PushTarget target() {
        return new PushTarget(endpoint, WebPushCrypto.fromBase64Url(p256dh), WebPushCrypto.fromBase64Url(auth));
    }
}
