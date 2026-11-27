package com.financetracker.notification;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Instant;

/**
 * The server's own key pair for Voluntary Application Server Identification (RFC 8292). The
 * browser is given the public key when it subscribes; every push then carries a JWT signed with
 * the private key, so the push service accepts messages for that subscription from this server only.
 */
public final class VapidKeys {

    // RFC 8292 allows up to 24 hours; shorter limits the damage if a request is ever replayed.
    static final long TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

    private final ECPrivateKey privateKey;
    private final ECPublicKey publicKey;
    private final String publicKeyText;
    private final String subject;

    private VapidKeys(ECPrivateKey privateKey, ECPublicKey publicKey, String subject) {
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.publicKeyText = WebPushCrypto.base64Url(WebPushCrypto.encode(publicKey));
        this.subject = subject;
    }

    /**
     * Parses the base64url keys from the environment and checks that they belong together, so a
     * pasted-wrong key stops the app at startup instead of failing every push silently.
     */
    public static VapidKeys parse(String publicKeyText, String privateKeyText, String subject) {
        // http only for a local run; push services expect a reachable contact.
        if (subject == null || !(subject.startsWith("mailto:") || subject.startsWith("https://")
                || subject.startsWith("http://localhost"))) {
            throw new IllegalArgumentException("VAPID subject must be a mailto: or https: URL");
        }
        ECPublicKey publicKey;
        ECPrivateKey privateKey;
        try {
            publicKey = WebPushCrypto.publicKey(WebPushCrypto.fromBase64Url(publicKeyText));
            privateKey = WebPushCrypto.privateKey(WebPushCrypto.fromBase64Url(privateKeyText));
        } catch (IllegalArgumentException e) {
            // The message never contains the key itself.
            throw new IllegalArgumentException("VAPID keys are not valid base64url P-256 keys");
        }
        VapidKeys keys = new VapidKeys(privateKey, publicKey, subject);
        byte[] probe = "fifty30-vapid-check".getBytes(StandardCharsets.US_ASCII);
        if (!verify(publicKey, probe, keys.sign(probe))) {
            throw new IllegalArgumentException("VAPID public and private keys do not belong together");
        }
        return keys;
    }

    static VapidKeys of(KeyPair pair, String subject) {
        return new VapidKeys((ECPrivateKey) pair.getPrivate(), (ECPublicKey) pair.getPublic(), subject);
    }

    /** What the browser passes as applicationServerKey when it subscribes. */
    public String publicKey() {
        return publicKeyText;
    }

    /** The Authorization header for a push to the given push service origin (RFC 8292 section 3). */
    public String authorization(String audience, Instant now) {
        String header = base64Json("{\"typ\":\"JWT\",\"alg\":\"ES256\"}");
        String claims = base64Json("{\"aud\":\"" + json(audience) + "\",\"exp\":"
                + (now.getEpochSecond() + TOKEN_LIFETIME_SECONDS) + ",\"sub\":\"" + json(subject) + "\"}");
        String signingInput = header + "." + claims;
        String signature = WebPushCrypto.base64Url(sign(signingInput.getBytes(StandardCharsets.US_ASCII)));
        return "vapid t=" + signingInput + "." + signature + ", k=" + publicKeyText;
    }

    // ES256 in JWTs is the raw 64-byte R || S, which is what the P1363 format gives directly.
    private byte[] sign(byte[] data) {
        try {
            Signature signer = Signature.getInstance("SHA256withECDSAinP1363Format");
            signer.initSign(privateKey);
            signer.update(data);
            return signer.sign();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("VAPID signing failed", e);
        }
    }

    static boolean verify(ECPublicKey key, byte[] data, byte[] signature) {
        try {
            Signature verifier = Signature.getInstance("SHA256withECDSAinP1363Format");
            verifier.initVerify(key);
            verifier.update(data);
            return verifier.verify(signature);
        } catch (GeneralSecurityException e) {
            return false;
        }
    }

    ECPublicKey publicKeyValue() {
        return publicKey;
    }

    private static String base64Json(String json) {
        return WebPushCrypto.base64Url(json.getBytes(StandardCharsets.UTF_8));
    }

    // The audience is a URL origin and the subject a mailto: or https: URL, so quotes and
    // backslashes are the only characters that could break the JSON.
    private static String json(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
