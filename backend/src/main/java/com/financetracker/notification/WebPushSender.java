package com.financetracker.notification;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import tools.jackson.databind.json.JsonMapper;

/**
 * Sends Web Push messages (RFC 8030) straight to the browser's push service (Firebase Cloud
 * Messaging for Chrome on Android): the JSON message encrypted for that browser (RFC 8291) and a
 * VAPID signature (RFC 8292). JDK HttpClient only, no third-party push library.
 */
public class WebPushSender implements PushSender {

    private static final Logger log = LoggerFactory.getLogger(WebPushSender.class);

    private final HttpClient http;
    private final VapidKeys keys;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public WebPushSender(VapidKeys keys, JsonMapper jsonMapper, Clock clock) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build(), keys, jsonMapper, clock);
    }

    WebPushSender(HttpClient http, VapidKeys keys, JsonMapper jsonMapper, Clock clock) {
        this.http = http;
        this.keys = keys;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    @Override
    public Optional<String> publicKey() {
        return Optional.of(keys.publicKey());
    }

    @Override
    public Delivery send(PushTarget target, PushMessage message) {
        URI endpoint = URI.create(target.endpoint());
        byte[] body = WebPushCrypto.encrypt(target.p256dh(), target.auth(), payload(message));

        HttpRequest.Builder request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", keys.authorization(origin(endpoint), clock.instant()))
                .header("Content-Encoding", "aes128gcm")
                .header("Content-Type", "application/octet-stream")
                .header("TTL", Integer.toString(message.ttlSeconds()))
                .header("Urgency", message.urgency().header())
                .POST(HttpRequest.BodyPublishers.ofByteArray(body));
        if (message.tag() != null) {
            // The push service keeps only the newest message per topic for an offline phone.
            request.header("Topic", message.tag());
        }

        int status;
        try {
            status = http.send(request.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
        } catch (IOException e) {
            log.warn("Push to {} failed: {}", endpoint.getHost(), e.getClass().getSimpleName());
            return Delivery.FAILED;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Delivery.FAILED;
        }
        if (status / 100 == 2) {
            return Delivery.DELIVERED;
        }
        if (status == 404 || status == 410) {
            return Delivery.GONE;
        }
        // Only the host and status: the endpoint path identifies the browser.
        log.warn("Push to {} returned HTTP {}", endpoint.getHost(), status);
        return Delivery.FAILED;
    }

    private byte[] payload(PushMessage message) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("title", message.title());
        json.put("body", message.body());
        json.put("url", message.url());
        if (message.tag() != null) {
            json.put("tag", message.tag());
        }
        return jsonMapper.writeValueAsString(json).getBytes(StandardCharsets.UTF_8);
    }

    // RFC 8292: the JWT audience is the push service's origin.
    static String origin(URI endpoint) {
        return endpoint.getScheme() + "://" + endpoint.getHost() + (endpoint.getPort() == -1 ? "" : ":" + endpoint.getPort());
    }
}
