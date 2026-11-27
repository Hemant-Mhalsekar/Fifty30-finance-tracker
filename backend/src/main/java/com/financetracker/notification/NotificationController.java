package com.financetracker.notification;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Notifications")
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    public record KeyView(String publicKey) {
    }

    public record Keys(String p256dh, String auth) {
    }

    // The shape of the browser's PushSubscription.toJSON(); expirationTime is ignored.
    public record SubscribeRequest(String endpoint, Keys keys) {
    }

    public record UnsubscribeRequest(String endpoint) {
    }

    public record SettingsRequest(Boolean recurringDue, Boolean eveningReminder, Boolean budgetAlerts,
            Boolean cycleSummary) {
    }

    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
    }

    @Operation(summary = "The key browsers subscribe with",
            description = "The VAPID public key (base64url) for PushManager.subscribe; null when notifications"
                    + " are not set up on this server.")
    @GetMapping("/key")
    public KeyView key() {
        return new KeyView(service.publicKey().orElse(null));
    }

    @Operation(summary = "Turn notifications on for this browser",
            description = "Send PushSubscription.toJSON(). Only real push services are accepted. Sending a known"
                    + " endpoint again updates its keys and moves it to you; up to 10 devices are kept, newest first.")
    @PostMapping("/subscribe")
    public ResponseEntity<Void> subscribe(@AuthenticationPrincipal Jwt jwt, @RequestBody SubscribeRequest request) {
        Keys keys = request.keys();
        service.subscribe(userId(jwt), request.endpoint(), keys == null ? null : keys.p256dh(),
                keys == null ? null : keys.auth());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Turn notifications off for this browser",
            description = "Removes your subscription for the endpoint; an unknown endpoint is not an error.")
    @PostMapping("/unsubscribe")
    public ResponseEntity<Void> unsubscribe(@AuthenticationPrincipal Jwt jwt,
            @RequestBody UnsubscribeRequest request) {
        service.unsubscribe(userId(jwt), request.endpoint());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Send a test notification", description = "To every device of yours; 5 per 10 minutes.")
    @PostMapping("/test")
    public ResponseEntity<NotificationService.SendResult> test(@AuthenticationPrincipal Jwt jwt) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.sendTest(userId(jwt)));
    }

    @Operation(summary = "Which notifications you get", description = "All on until you change them.")
    @GetMapping("/settings")
    public NotificationSettings settings(@AuthenticationPrincipal Jwt jwt) {
        return service.settings(userId(jwt));
    }

    @Operation(summary = "Choose which notifications you get", description = "All four values are required.")
    @PutMapping("/settings")
    public NotificationSettings updateSettings(@AuthenticationPrincipal Jwt jwt,
            @RequestBody SettingsRequest request) {
        return service.updateSettings(userId(jwt), request.recurringDue(), request.eveningReminder(),
                request.budgetAlerts(), request.cycleSummary());
    }

    private static UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
