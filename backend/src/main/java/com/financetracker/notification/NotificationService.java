package com.financetracker.notification;

import java.net.URI;
import java.net.URISyntaxException;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import com.financetracker.ratelimit.RateLimiter;

/**
 * Push subscriptions, per-person notification settings, and sending. Sending never throws and
 * never holds a transaction open while it waits on a push service.
 */
@Service
public class NotificationService {

    static final int MAX_DEVICES = 10;

    // The server POSTs to the endpoint a browser gives it, so only real push services are
    // accepted; anything else could point the server at an internal address.
    private static final Set<String> PUSH_HOSTS =
            Set.of("fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com");
    private static final List<String> PUSH_HOST_SUFFIXES = List.of(".notify.windows.com", ".push.apple.com");

    public record SendResult(int devices, int delivered) {
    }

    private final PushSubscriptionRepository subscriptions;
    private final NotificationSettingsRepository settings;
    private final PushSender sender;
    private final RateLimiter rateLimiter;
    private final TransactionTemplate transaction;

    public NotificationService(PushSubscriptionRepository subscriptions, NotificationSettingsRepository settings,
            PushSender sender, RateLimiter rateLimiter, PlatformTransactionManager transactionManager) {
        this.subscriptions = subscriptions;
        this.settings = settings;
        this.sender = sender;
        this.rateLimiter = rateLimiter;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    public Optional<String> publicKey() {
        return sender.publicKey();
    }

    @Transactional
    public void subscribe(UUID userId, String endpoint, String p256dh, String auth) {
        requireEnabled();
        String checkedEndpoint = checkEndpoint(endpoint);
        byte[] publicKey;
        byte[] secret;
        try {
            publicKey = WebPushCrypto.encode(WebPushCrypto.publicKey(WebPushCrypto.fromBase64Url(p256dh)));
            secret = WebPushCrypto.fromBase64Url(auth);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw invalidKeys();
        }
        if (secret.length != WebPushCrypto.AUTH_SECRET_LENGTH) {
            throw invalidKeys();
        }
        if (subscriptions.upsert(userId, checkedEndpoint, WebPushCrypto.base64Url(publicKey),
                WebPushCrypto.base64Url(secret)) == 0) {
            // The account was deleted while the token was still valid.
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        subscriptions.keepNewest(userId, MAX_DEVICES);
    }

    // Only removes this user's own row; an unknown endpoint is already "off", so no error.
    @Transactional
    public void unsubscribe(UUID userId, String endpoint) {
        if (endpoint == null || endpoint.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Endpoint is required");
        }
        subscriptions.deleteByEndpointAndUser(endpoint.trim(), userId);
    }

    @Transactional(readOnly = true)
    public NotificationSettings settings(UUID userId) {
        return settings.find(userId).orElse(NotificationSettings.ALL_ON);
    }

    @Transactional
    public NotificationSettings updateSettings(UUID userId, Boolean recurringDue, Boolean eveningReminder,
            Boolean budgetAlerts, Boolean cycleSummary) {
        if (recurringDue == null || eveningReminder == null || budgetAlerts == null || cycleSummary == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "All four settings are required");
        }
        NotificationSettings next = new NotificationSettings(recurringDue, eveningReminder, budgetAlerts, cycleSummary);
        if (settings.save(userId, next) == 0) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        }
        return next;
    }

    /** "Send a test" in Settings: every device of this person, right away. */
    public SendResult sendTest(UUID userId) {
        requireEnabled();
        rateLimiter.consume("push-test", userId.toString(), 5, Duration.ofMinutes(10));
        if (subscriptions.countByUserId(userId) == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Turn on notifications on a device first");
        }
        return sendToUser(userId, new PushMessage("Notifications are on",
                "Fifty30 will remind you here. You can choose which ones in Settings.", "/settings", "test", 60,
                PushMessage.Urgency.NORMAL));
    }

    /**
     * Sends to every device of the person and forgets devices the push service no longer knows.
     * Returns how many accepted it; failures are logged by the sender, never thrown.
     */
    public SendResult sendToUser(UUID userId, PushMessage message) {
        List<PushSubscription> devices = subscriptions.findAllByUserId(userId);
        int delivered = 0;
        for (PushSubscription device : devices) {
            PushSender.Delivery result;
            try {
                result = sender.send(device.target(), message);
            } catch (RuntimeException e) {
                // A stored key that no longer parses, or a bug: one device never stops the others.
                result = PushSender.Delivery.FAILED;
            }
            if (result == PushSender.Delivery.DELIVERED) {
                delivered++;
            } else if (result == PushSender.Delivery.GONE) {
                transaction.executeWithoutResult(status -> subscriptions.deleteGone(device.getEndpoint()));
            }
        }
        return new SendResult(devices.size(), delivered);
    }

    private void requireEnabled() {
        if (sender.publicKey().isEmpty()) {
            // 409 rather than 503: the server is fine, this feature is just not configured.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Notifications are not set up on this server");
        }
    }

    static String checkEndpoint(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Endpoint is required");
        }
        String trimmed = endpoint.trim();
        URI uri;
        try {
            uri = new URI(trimmed);
        } catch (URISyntaxException e) {
            throw unsupported();
        }
        String host = uri.getHost();
        boolean knownHost = host != null
                && (PUSH_HOSTS.contains(host) || PUSH_HOST_SUFFIXES.stream().anyMatch(host::endsWith));
        if (trimmed.length() > 2048 || !"https".equals(uri.getScheme()) || uri.getUserInfo() != null
                || (uri.getPort() != -1 && uri.getPort() != 443) || !knownHost) {
            throw unsupported();
        }
        return trimmed;
    }

    private static ResponseStatusException unsupported() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "This push service is not supported");
    }

    private static ResponseStatusException invalidKeys() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid subscription keys");
    }
}
