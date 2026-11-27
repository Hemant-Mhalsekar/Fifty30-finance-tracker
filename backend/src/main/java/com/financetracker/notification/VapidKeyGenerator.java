package com.financetracker.notification;

import java.math.BigInteger;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;

/**
 * Prints a new VAPID key pair for the environment. Uses nothing outside the JDK, so it runs
 * straight from source:
 *
 * java backend/src/main/java/com/financetracker/notification/VapidKeyGenerator.java
 *
 * Generate the pair once per environment (local and Render differ) and keep the private key secret.
 * Changing the keys later stops every existing subscription; users then turn notifications on again.
 */
public final class VapidKeyGenerator {

    private VapidKeyGenerator() {
    }

    public static void main(String[] args) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"), new SecureRandom());
        var pair = generator.generateKeyPair();
        ECPublicKey publicKey = (ECPublicKey) pair.getPublic();
        ECPrivateKey privateKey = (ECPrivateKey) pair.getPrivate();

        byte[] point = new byte[65];
        point[0] = 4;
        put(publicKey.getW().getAffineX(), point, 1);
        put(publicKey.getW().getAffineY(), point, 33);
        byte[] scalar = new byte[32];
        put(privateKey.getS(), scalar, 0);

        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        System.out.println("VAPID_PUBLIC_KEY=" + b64.encodeToString(point));
        System.out.println("VAPID_PRIVATE_KEY=" + b64.encodeToString(scalar));
    }

    private static void put(BigInteger value, byte[] out, int offset) {
        byte[] bytes = value.toByteArray();
        int start = Math.max(0, bytes.length - 32);
        int length = bytes.length - start;
        System.arraycopy(bytes, start, out, offset + 32 - length, length);
    }
}
