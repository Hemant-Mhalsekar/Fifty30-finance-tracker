package com.financetracker.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Instant;

import org.junit.jupiter.api.Test;

class VapidKeysTest {

    @Test
    void signsAnEs256TokenForThePushServiceOrigin() {
        KeyPair pair = WebPushCrypto.newKeyPair();
        VapidKeys keys = VapidKeys.parse(publicText(pair), privateText(pair), "https://fifty30-finance-tracker.vercel.app");

        String header = keys.authorization("https://fcm.googleapis.com", Instant.parse("2026-11-27T10:00:00Z"));
        assertTrue(header.startsWith("vapid t="));
        assertTrue(header.endsWith(", k=" + keys.publicKey()));
        String jwt = header.substring("vapid t=".length(), header.indexOf(", k="));
        String[] parts = jwt.split("\\.");
        assertEquals(3, parts.length);
        assertEquals("{\"typ\":\"JWT\",\"alg\":\"ES256\"}", text(parts[0]));
        assertEquals("{\"aud\":\"https://fcm.googleapis.com\",\"exp\":" + (1_795_773_600L + 12 * 3600)
                + ",\"sub\":\"https://fifty30-finance-tracker.vercel.app\"}", text(parts[1]));
        // Raw R || S, as JWT requires (not DER).
        byte[] signature = WebPushCrypto.fromBase64Url(parts[2]);
        assertEquals(64, signature.length);
        assertTrue(VapidKeys.verify((ECPublicKey) pair.getPublic(),
                (parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII), signature));
    }

    @Test
    void refusesKeysThatDoNotBelongTogetherOrAreNotKeys() {
        KeyPair pair = WebPushCrypto.newKeyPair();
        KeyPair other = WebPushCrypto.newKeyPair();
        IllegalArgumentException mismatch = assertThrows(IllegalArgumentException.class,
                () -> VapidKeys.parse(publicText(pair), privateText(other), "mailto:owner@example.com"));
        assertEquals("VAPID public and private keys do not belong together", mismatch.getMessage());
        IllegalArgumentException garbage = assertThrows(IllegalArgumentException.class,
                () -> VapidKeys.parse("not-a-key", privateText(pair), "mailto:owner@example.com"));
        // The message never repeats the key.
        assertEquals("VAPID keys are not valid base64url P-256 keys", garbage.getMessage());
        assertThrows(IllegalArgumentException.class,
                () -> VapidKeys.parse(publicText(pair), privateText(pair), "owner@example.com"));
    }

    static String publicText(KeyPair pair) {
        return WebPushCrypto.base64Url(WebPushCrypto.encode((ECPublicKey) pair.getPublic()));
    }

    static String privateText(KeyPair pair) {
        return WebPushCrypto.base64Url(WebPushCrypto.encode((ECPrivateKey) pair.getPrivate()));
    }

    private static String text(String base64Url) {
        return new String(WebPushCrypto.fromBase64Url(base64Url), StandardCharsets.UTF_8);
    }
}
