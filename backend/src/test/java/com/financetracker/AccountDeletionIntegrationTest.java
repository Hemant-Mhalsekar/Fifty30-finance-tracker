package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import com.financetracker.account.AccountDeletionJob;

import jakarta.servlet.http.Cookie;

class AccountDeletionIntegrationTest extends AbstractIntegrationTest {

    private static final String PASSWORD = "password123";

    @Autowired
    private AccountDeletionJob deletionJob;

    @Autowired
    private Clock clock;

    @Test
    void deletionNeedsThePasswordEndsEverySessionAndLoggingInCancelsIt() throws Exception {
        mockMvc.perform(post("/api/account/deletion")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isUnauthorized());

        String email = nextUniqueEmail();
        MvcResult registered = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(email, PASSWORD)))
                .andExpect(status().isCreated())
                .andReturn();
        String token = jsonMapper.readTree(registered.getResponse().getContentAsString()).get("accessToken").asText();
        Cookie refresh = registered.getResponse().getCookie("refresh_token");
        assertNotNull(refresh);
        UUID userId = userId(token);

        // Wrong password: 400 (not 401, which the app would read as "logged out"), nothing changes.
        mockMvc.perform(post("/api/account/deletion")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"wrong-password\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Password is incorrect"));
        mockMvc.perform(post("/api/account/deletion")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Password is required"));
        assertNull(scheduledAt(userId));

        MvcResult accepted = mockMvc.perform(post("/api/account/deletion")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isAccepted())
                .andReturn();
        OffsetDateTime deleteAfter = OffsetDateTime.parse(
                jsonMapper.readTree(accepted.getResponse().getContentAsString()).get("deleteAfter").asText());
        Duration fromNow = Duration.between(OffsetDateTime.now(clock), deleteAfter);
        assertTrue(fromNow.compareTo(Duration.ofDays(7).minusMinutes(1)) > 0 && fromNow.compareTo(Duration.ofDays(7)) <= 0);
        assertNotNull(scheduledAt(userId));

        // Every session has ended: the refresh cookie no longer works.
        mockMvc.perform(post("/api/auth/refresh").cookie(refresh)).andExpect(status().isUnauthorized());

        // Logging in during the grace period keeps the account and says so, once.
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(email, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountRestored").value(true));
        assertNull(scheduledAt(userId));
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(email, PASSWORD)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountRestored").value(false));
    }

    @Test
    void theJobDeletesDueAccountsWithAllTheirDataAndNothingElse() throws Exception {
        String leaving = registerUserAndGetToken();
        String staying = registerUserAndGetToken();
        onboardUser(leaving);
        onboardUser(staying);
        logExpense(leaving);
        logExpense(staying);
        UUID leavingId = userId(leaving);
        UUID stayingId = userId(staying);

        requestDeletion(leaving);
        // Not due yet: nothing is deleted.
        deletionJob.deleteDueAccounts();
        assertEquals(1, count("users", "id", leavingId));

        jdbcTemplate.update("UPDATE users SET deletion_scheduled_at = now() - interval '1 minute' WHERE id = ?", leavingId);
        assertTrue(deletionJob.deleteDueAccounts() >= 1);

        assertEquals(0, count("users", "id", leavingId));
        for (String table : new String[] {"expenses", "categories", "cycles", "refresh_tokens"}) {
            assertEquals(0, count(table, "user_id", leavingId), table);
            assertTrue(count(table, "user_id", stayingId) > 0, table);
        }
    }

    @Test
    void loggingInAfterTheDeadlineFindsNoAccountEvenBeforeTheJobRuns() throws Exception {
        String email = nextUniqueEmail();
        String token = registerUserAndGetToken(email, PASSWORD);
        UUID userId = userId(token);
        requestDeletion(token);
        jdbcTemplate.update("UPDATE users SET deletion_scheduled_at = now() - interval '1 minute' WHERE id = ?", userId);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials(email, PASSWORD)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
        assertEquals(0, count("users", "id", userId));
    }

    // ---- helpers ----

    private void requestDeletion(String token) throws Exception {
        mockMvc.perform(post("/api/account/deletion")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isAccepted());
    }

    private void logExpense(String token) throws Exception {
        mockMvc.perform(post("/api/expenses")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountPaise\":1000,\"categoryId\":\"" + findCategoryIdByName(token, "Dining")
                                + "\",\"description\":\"Tea\"}"))
                .andExpect(status().isCreated());
    }

    private static String credentials(String email, String password) {
        return "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}";
    }

    private OffsetDateTime scheduledAt(UUID userId) {
        return jdbcTemplate.queryForObject(
                "SELECT deletion_scheduled_at FROM users WHERE id = ?", OffsetDateTime.class, userId);
    }

    private int count(String table, String column, UUID id) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM " + table + " WHERE " + column + " = ?", Integer.class, id);
        return n != null ? n : 0;
    }

    private UUID userId(String token) throws Exception {
        MvcResult me = mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn();
        return UUID.fromString(jsonMapper.readTree(me.getResponse().getContentAsString()).get("id").asText());
    }
}
