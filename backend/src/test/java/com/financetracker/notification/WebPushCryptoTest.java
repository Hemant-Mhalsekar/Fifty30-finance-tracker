package com.financetracker.notification;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;

import org.junit.jupiter.api.Test;

class WebPushCryptoTest {

    // RFC 8291 section 5 (the worked example) and Appendix A.
    private static final String PLAINTEXT = "When I grow up, I want to be a watermelon";
    private static final String AS_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    private static final String AS_PUBLIC =
            "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    static final String UA_PRIVATE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94";
    static final String UA_PUBLIC =
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    static final String AUTH_SECRET = "BTBZMqHH6r4Tts7J_aSIgg";
    private static final String SALT = "DGv6ra1nlYgDCS1FRnbzlw";
    private static final String BODY = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6"
            + "e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj"
            + "_Qulcy4a-fN";

    @Test
    void matchesTheRfc8291Example() {
        KeyPair server = new KeyPair(WebPushCrypto.publicKey(b64(AS_PUBLIC)), WebPushCrypto.privateKey(b64(AS_PRIVATE)));
        byte[] body = WebPushCrypto.encrypt(b64(UA_PUBLIC), b64(AUTH_SECRET),
                PLAINTEXT.getBytes(StandardCharsets.US_ASCII), server, b64(SALT));
        assertEquals(BODY, WebPushCrypto.base64Url(body));
    }

    @Test
    void everyMessageUsesAFreshKeyAndSaltAndStillDecrypts() {
        byte[] plaintext = "{\"title\":\"Rent is due\"}".getBytes(StandardCharsets.UTF_8);
        byte[] first = WebPushCrypto.encrypt(b64(UA_PUBLIC), b64(AUTH_SECRET), plaintext);
        byte[] second = WebPushCrypto.encrypt(b64(UA_PUBLIC), b64(AUTH_SECRET), plaintext);
        assertEquals(false, java.util.Arrays.equals(first, second));
        assertArrayEquals(plaintext, PushDecryption.decrypt(first, UA_PRIVATE, UA_PUBLIC, AUTH_SECRET));
        assertArrayEquals(plaintext, PushDecryption.decrypt(second, UA_PRIVATE, UA_PUBLIC, AUTH_SECRET));
    }

    @Test
    void keysRoundTripAndBadKeysAreRejected() {
        KeyPair pair = WebPushCrypto.newKeyPair();
        byte[] encoded = WebPushCrypto.encode((ECPublicKey) pair.getPublic());
        assertEquals(65, encoded.length);
        assertEquals(pair.getPublic(), WebPushCrypto.publicKey(encoded));
        assertEquals(32, WebPushCrypto.encode((ECPrivateKey) pair.getPrivate()).length);

        assertThrows(IllegalArgumentException.class, () -> WebPushCrypto.publicKey(new byte[64]));
        assertThrows(IllegalArgumentException.class, () -> WebPushCrypto.publicKey(new byte[65]));
        byte[] offCurve = b64(UA_PUBLIC);
        offCurve[64] ^= 1;
        assertThrows(IllegalArgumentException.class, () -> WebPushCrypto.publicKey(offCurve));
        assertThrows(IllegalArgumentException.class,
                () -> WebPushCrypto.encrypt(b64(UA_PUBLIC), new byte[15], new byte[1]));
        assertThrows(IllegalArgumentException.class,
                () -> WebPushCrypto.encrypt(b64(UA_PUBLIC), b64(AUTH_SECRET), new byte[WebPushCrypto.MAX_PLAINTEXT + 1]));
    }

    private static byte[] b64(String text) {
        return WebPushCrypto.fromBase64Url(text);
    }
}
