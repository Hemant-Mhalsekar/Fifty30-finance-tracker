package com.financetracker.notification;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECFieldFp;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Message encryption for Web Push (RFC 8291, "aes128gcm" content coding of RFC 8188), written on
 * the JDK alone: ECDH on P-256, HKDF-SHA-256 and AES-128-GCM. A push service only ever sees the
 * encrypted body; the browser that subscribed holds the private key that opens it.
 */
public final class WebPushCrypto {

    /** Uncompressed P-256 public key: 0x04, then X and Y, 32 bytes each. */
    public static final int PUBLIC_KEY_LENGTH = 65;
    public static final int AUTH_SECRET_LENGTH = 16;
    // One record holds the whole message (RFC 8291 allows nothing else).
    static final int RECORD_SIZE = 4096;
    // Push services accept at most 4096 bytes of body: header (salt 16 + record size 4 + key id
    // length 1 + key id 65) and the record (message + delimiter 1 + GCM tag 16).
    public static final int MAX_PLAINTEXT = 4096 - 86 - 17;

    private static final ECParameterSpec P256 = p256();
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64_DECODER = Base64.getUrlDecoder();

    private WebPushCrypto() {
    }

    /** Encrypts with a fresh key pair and salt, as every message must. */
    public static byte[] encrypt(byte[] userAgentPublicKey, byte[] authSecret, byte[] plaintext) {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        return encrypt(userAgentPublicKey, authSecret, plaintext, newKeyPair(), salt);
    }

    // Fixed key pair and salt only for the RFC 8291 test vector.
    static byte[] encrypt(byte[] userAgentPublicKey, byte[] authSecret, byte[] plaintext, KeyPair serverKeys,
            byte[] salt) {
        if (plaintext.length > MAX_PLAINTEXT) {
            throw new IllegalArgumentException("Push message too long: " + plaintext.length + " bytes");
        }
        if (authSecret.length != AUTH_SECRET_LENGTH) {
            throw new IllegalArgumentException("Auth secret must be 16 bytes");
        }
        try {
            ECPublicKey userAgentKey = publicKey(userAgentPublicKey);
            byte[] serverPublic = encode((ECPublicKey) serverKeys.getPublic());

            KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
            agreement.init(serverKeys.getPrivate());
            agreement.doPhase(userAgentKey, true);
            byte[] sharedSecret = agreement.generateSecret();

            // RFC 8291 section 3.4: mix in the auth secret and both public keys, then derive the
            // content key and nonce from the per-message salt (RFC 8188 section 2.2).
            byte[] keyInfo = concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII),
                    userAgentPublicKey, serverPublic);
            byte[] ikm = hkdfExpand(hkdfExtract(authSecret, sharedSecret), keyInfo, 32);
            byte[] prk = hkdfExtract(salt, ikm);
            byte[] contentKey = hkdfExpand(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
            byte[] nonce = hkdfExpand(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);

            Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
            gcm.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(contentKey, "AES"), new GCMParameterSpec(128, nonce));
            // 0x02 marks the last (and only) record; no further padding.
            byte[] padded = Arrays.copyOf(plaintext, plaintext.length + 1);
            padded[plaintext.length] = 2;
            byte[] ciphertext = gcm.doFinal(padded);

            ByteBuffer body = ByteBuffer.allocate(16 + 4 + 1 + serverPublic.length + ciphertext.length);
            body.put(salt).putInt(RECORD_SIZE).put((byte) serverPublic.length).put(serverPublic).put(ciphertext);
            return body.array();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Web Push encryption failed", e);
        }
    }

    /** A fresh P-256 key pair. */
    public static KeyPair newKeyPair() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
            return generator.generateKeyPair();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Uncompressed point bytes to a key; rejects anything that is not a point on P-256. */
    public static ECPublicKey publicKey(byte[] encoded) {
        if (encoded == null || encoded.length != PUBLIC_KEY_LENGTH || encoded[0] != 4) {
            throw new IllegalArgumentException("Not an uncompressed P-256 public key");
        }
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(encoded, 1, 33));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(encoded, 33, 65));
        // KeyFactory accepts any coordinates, so check y^2 = x^3 + ax + b (mod p) here.
        if (!onCurve(x, y)) {
            throw new IllegalArgumentException("Point is not on P-256");
        }
        try {
            return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x, y), P256));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("Not a P-256 public key", e);
        }
    }

    /** A 32-byte private scalar to a key. */
    public static ECPrivateKey privateKey(byte[] scalar) {
        if (scalar == null || scalar.length != 32) {
            throw new IllegalArgumentException("A P-256 private key is 32 bytes");
        }
        try {
            return (ECPrivateKey) KeyFactory.getInstance("EC")
                    .generatePrivate(new ECPrivateKeySpec(new BigInteger(1, scalar), P256));
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("Not a P-256 private key", e);
        }
    }

    /** A key as 0x04 || X || Y, each coordinate padded to 32 bytes. */
    public static byte[] encode(ECPublicKey key) {
        byte[] out = new byte[PUBLIC_KEY_LENGTH];
        out[0] = 4;
        copyUnsigned(key.getW().getAffineX(), out, 1);
        copyUnsigned(key.getW().getAffineY(), out, 33);
        return out;
    }

    /** The private scalar as exactly 32 bytes. */
    public static byte[] encode(ECPrivateKey key) {
        byte[] out = new byte[32];
        copyUnsigned(key.getS(), out, 0);
        return out;
    }

    public static String base64Url(byte[] bytes) {
        return B64.encodeToString(bytes);
    }

    /** Accepts base64url with or without padding; throws IllegalArgumentException otherwise. */
    public static byte[] fromBase64Url(String text) {
        return B64_DECODER.decode(text.trim());
    }

    static byte[] hkdfExtract(byte[] salt, byte[] ikm) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        return mac.doFinal(ikm);
    }

    // Every length used here is at most one SHA-256 block, so one round of HKDF-Expand suffices.
    static byte[] hkdfExpand(byte[] prk, byte[] info, int length) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update(info);
        mac.update((byte) 1);
        return Arrays.copyOf(mac.doFinal(), length);
    }

    private static boolean onCurve(BigInteger x, BigInteger y) {
        BigInteger p = ((ECFieldFp) P256.getCurve().getField()).getP();
        if (x.compareTo(p) >= 0 || y.compareTo(p) >= 0) {
            return false;
        }
        BigInteger left = y.multiply(y).mod(p);
        BigInteger right = x.pow(3).add(P256.getCurve().getA().multiply(x)).add(P256.getCurve().getB()).mod(p);
        return left.equals(right);
    }

    private static void copyUnsigned(BigInteger value, byte[] out, int offset) {
        byte[] bytes = value.toByteArray();
        int start = Math.max(0, bytes.length - 32);
        int length = bytes.length - start;
        System.arraycopy(bytes, start, out, offset + 32 - length, length);
    }

    private static byte[] concat(byte[]... parts) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (byte[] part : parts) {
            out.writeBytes(part);
        }
        return out.toByteArray();
    }

    private static ECParameterSpec p256() {
        try {
            AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
            parameters.init(new ECGenParameterSpec("secp256r1"));
            return parameters.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
