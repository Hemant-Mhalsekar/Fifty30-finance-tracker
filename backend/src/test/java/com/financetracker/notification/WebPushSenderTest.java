package com.financetracker.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

import tools.jackson.databind.json.JsonMapper;

// Against a local stand-in for a push service: checks the request a real one would receive.
class WebPushSenderTest {

    private HttpServer server;
    private final AtomicInteger status = new AtomicInteger(201);
    private final Map<String, String> headers = new ConcurrentHashMap<>();
    private final AtomicReference<byte[]> body = new AtomicReference<>();
    private WebPushSender sender;
    private VapidKeys keys;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/push/abc", exchange -> {
            exchange.getRequestHeaders().forEach((name, values) -> headers.put(name.toLowerCase(), values.getFirst()));
            body.set(exchange.getRequestBody().readAllBytes());
            exchange.sendResponseHeaders(status.get(), -1);
            exchange.close();
        });
        server.start();
        keys = VapidKeys.of(WebPushCrypto.newKeyPair(), "mailto:owner@example.com");
        sender = new WebPushSender(keys, JsonMapper.builder().build(),
                Clock.fixed(Instant.parse("2026-11-27T10:00:00Z"), ZoneOffset.UTC));
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    @Test
    void postsAnEncryptedSignedMessageTheBrowserCanOpen() {
        PushMessage message = new PushMessage("Rent is due today", "₹15,000 · tap to add or skip", "/recurring",
                "recurring-due", 4 * 3600, PushMessage.Urgency.HIGH);

        assertEquals(PushSender.Delivery.DELIVERED, sender.send(target(), message));

        assertEquals("aes128gcm", headers.get("content-encoding"));
        assertEquals("14400", headers.get("ttl"));
        assertEquals("high", headers.get("urgency"));
        assertEquals("recurring-due", headers.get("topic"));
        String authorization = headers.get("authorization");
        assertTrue(authorization.startsWith("vapid t=") && authorization.endsWith(", k=" + keys.publicKey()));
        // The JWT audience is the push service origin, port included.
        String claims = new String(WebPushCrypto.fromBase64Url(authorization.split("\\.")[1]), StandardCharsets.UTF_8);
        assertTrue(claims.contains("\"aud\":\"http://127.0.0.1:" + server.getAddress().getPort() + "\""), claims);

        String opened = new String(PushDecryption.decrypt(body.get(), WebPushCryptoTest.UA_PRIVATE,
                WebPushCryptoTest.UA_PUBLIC, WebPushCryptoTest.AUTH_SECRET), StandardCharsets.UTF_8);
        assertEquals("{\"title\":\"Rent is due today\",\"body\":\"₹15,000 · tap to add or skip\",\"url\":\"/recurring\","
                + "\"tag\":\"recurring-due\"}", opened);
    }

    @Test
    void mapsThePushServiceAnswer() {
        PushMessage message = new PushMessage("Hi", "", "/", null, 60, PushMessage.Urgency.NORMAL);
        status.set(410);
        assertEquals(PushSender.Delivery.GONE, sender.send(target(), message));
        status.set(404);
        assertEquals(PushSender.Delivery.GONE, sender.send(target(), message));
        status.set(429);
        assertEquals(PushSender.Delivery.FAILED, sender.send(target(), message));
        status.set(500);
        assertEquals(PushSender.Delivery.FAILED, sender.send(target(), message));
        // No tag, no Topic header.
        assertEquals(null, headers.get("topic"));

        server.stop(0);
        assertEquals(PushSender.Delivery.FAILED, sender.send(target(), message));
    }

    private PushTarget target() {
        return new PushTarget("http://127.0.0.1:" + server.getAddress().getPort() + "/push/abc",
                WebPushCrypto.fromBase64Url(WebPushCryptoTest.UA_PUBLIC),
                WebPushCrypto.fromBase64Url(WebPushCryptoTest.AUTH_SECRET));
    }
}
