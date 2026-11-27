package com.financetracker.notification;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

// What the browser does on receipt (RFC 8291), so tests can check a message really opens.
final class PushDecryption {

    private PushDecryption() {
    }

    static byte[] decrypt(byte[] body, String uaPrivate, String uaPublic, String authSecret) {
        try {
            ByteBuffer in = ByteBuffer.wrap(body);
            byte[] salt = new byte[16];
            in.get(salt);
            in.getInt();
            byte[] serverPublic = new byte[in.get()];
            in.get(serverPublic);
            byte[] ciphertext = new byte[in.remaining()];
            in.get(ciphertext);

            byte[] uaPublicBytes = WebPushCrypto.fromBase64Url(uaPublic);
            KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
            agreement.init(WebPushCrypto.privateKey(WebPushCrypto.fromBase64Url(uaPrivate)));
            agreement.doPhase(WebPushCrypto.publicKey(serverPublic), true);
            byte[] info = concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), uaPublicBytes, serverPublic);
            byte[] ikm = WebPushCrypto.hkdfExpand(
                    WebPushCrypto.hkdfExtract(WebPushCrypto.fromBase64Url(authSecret), agreement.generateSecret()), info, 32);
            byte[] prk = WebPushCrypto.hkdfExtract(salt, ikm);
            byte[] key = WebPushCrypto.hkdfExpand(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
            byte[] nonce = WebPushCrypto.hkdfExpand(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);
            Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
            gcm.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
            byte[] padded = gcm.doFinal(ciphertext);
            if (padded[padded.length - 1] != 2) {
                throw new IllegalStateException("Missing last-record delimiter");
            }
            return Arrays.copyOf(padded, padded.length - 1);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static byte[] concat(byte[]... parts) {
        int length = 0;
        for (byte[] part : parts) {
            length += part.length;
        }
        ByteBuffer out = ByteBuffer.allocate(length);
        for (byte[] part : parts) {
            out.put(part);
        }
        return out.array();
    }
}
