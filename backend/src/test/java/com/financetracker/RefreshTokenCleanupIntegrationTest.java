package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

import com.financetracker.auth.RefreshTokenCleanup;

import jakarta.servlet.http.Cookie;

class RefreshTokenCleanupIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private RefreshTokenCleanup cleanup;

    @Test
    void deletesOnlyTokensExpiredMoreThanAWeekAgoAndKeepsReuseDetectionWorking() throws Exception {
        String accessToken = registerUserAndGetToken();
        UUID userId = userId(accessToken);
        OffsetDateTime now = OffsetDateTime.now();

        insertToken(userId, "expired-long-ago-revoked", now.minusDays(30), true);
        insertToken(userId, "expired-long-ago-unused", now.minusDays(8), false);
        insertToken(userId, "expired-recently-revoked", now.minusDays(2), true);
        insertToken(userId, "active-but-revoked", now.plusDays(10), true);

        cleanup.deleteExpiredTokens();

        List<String> left = jdbcTemplate.queryForList(
                "SELECT token_hash FROM refresh_tokens WHERE user_id = ?", String.class, userId);
        assertTrue(left.contains(sha256("expired-recently-revoked")), "kept: inside the retention week");
        assertTrue(left.contains(sha256("active-but-revoked")), "kept: needed for reuse detection");
        assertTrue(!left.contains(sha256("expired-long-ago-revoked")), "deleted: expired 30 days ago");
        assertTrue(!left.contains(sha256("expired-long-ago-unused")), "deleted: expired 8 days ago");
        // The session from registration is untouched.
        assertEquals(3, left.size());

        // A kept revoked token, presented again, still ends every session of its owner.
        mockMvc.perform(post("/api/auth/refresh").cookie(new Cookie("refresh_token", "expired-recently-revoked")))
                .andExpect(status().isUnauthorized());
        Integer active = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM refresh_tokens WHERE user_id = ? AND NOT revoked", Integer.class, userId);
        assertEquals(0, active);
    }

    @Test
    void runningTwiceIsHarmless() {
        cleanup.deleteExpiredTokens();
        assertEquals(0, cleanup.deleteExpiredTokens());
    }

    private void insertToken(UUID userId, String rawToken, OffsetDateTime expiresAt, boolean revoked) {
        jdbcTemplate.update(
                "INSERT INTO refresh_tokens (user_id, token_hash, expires_at, revoked) VALUES (?, ?, ?, ?)",
                userId, sha256(rawToken), expiresAt, revoked);
    }

    private UUID userId(String accessToken) throws Exception {
        String body = mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(accessToken)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(jsonMapper.readTree(body).get("id").asText());
    }

    // Same hashing as RefreshTokenService: SHA-256, lowercase hex.
    private static String sha256(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
