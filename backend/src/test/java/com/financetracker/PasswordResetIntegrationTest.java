package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import com.financetracker.mail.Email;
import com.financetracker.mail.EmailSender;

import jakarta.servlet.http.Cookie;

class PasswordResetIntegrationTest extends AbstractIntegrationTest {

    private static final Pattern TOKEN_IN_LINK = Pattern.compile("/reset-password\\?token=([A-Za-z0-9_-]+)");

    // Replaces the real sender for this test context and keeps every email in memory.
    @TestConfiguration
    static class CapturingMail {
        @Bean
        @Primary
        CapturingEmailSender capturingEmailSender() {
            return new CapturingEmailSender();
        }
    }

    static class CapturingEmailSender implements EmailSender {
        final List<Email> sent = new CopyOnWriteArrayList<>();

        @Override
        public void send(Email email) {
            sent.add(email);
        }
    }

    @Autowired
    private CapturingEmailSender mail;

    @BeforeEach
    void clearMail() {
        mail.sent.clear();
    }

    @Test
    void resetLinkChangesThePasswordWorksOnceAndLogsOutEverywhere() throws Exception {
        String email = nextUniqueEmail();
        MvcResult registration = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"old-password-1\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        Cookie oldSession = registration.getResponse().getCookie("refresh_token");

        // The address is normalized, so case and spaces do not matter.
        forgot("  " + email.toUpperCase() + " ").andExpect(status().isAccepted());
        Email sent = awaitEmailTo(email);
        assertEquals("Reset your Fifty30 password", sent.subject());
        assertTrue(sent.text().startsWith("Someone (hopefully you)"));
        String token = tokenFrom(sent);
        assertTrue(sent.html().contains("http://localhost:5173/reset-password?token=" + token));

        reset(token, "new-password-2").andExpect(status().isNoContent());

        login(email, "old-password-1").andExpect(status().isUnauthorized());
        login(email, "new-password-2").andExpect(status().isOk());
        // Sessions from before the reset are gone.
        mockMvc.perform(post("/api/auth/refresh").cookie(oldSession)).andExpect(status().isUnauthorized());
        // A link works once.
        reset(token, "third-password-3")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This reset link is invalid or has expired. Request a new one."));
    }

    @Test
    void unknownEmailsGetTheSameAnswerAndNoEmail() throws Exception {
        forgot("nobody-" + UUID.randomUUID() + "@example.com").andExpect(status().isAccepted());
        Thread.sleep(500);
        assertEquals(List.of(), mail.sent);
    }

    @Test
    void aNewRequestCancelsTheOlderLink() throws Exception {
        String email = nextUniqueEmail();
        registerUserAndGetToken(email, "password123");

        forgot(email).andExpect(status().isAccepted());
        String first = tokenFrom(awaitEmailTo(email));
        mail.sent.clear();
        forgot(email).andExpect(status().isAccepted());
        String second = tokenFrom(awaitEmailTo(email));

        reset(first, "new-password-2").andExpect(status().isBadRequest());
        reset(second, "new-password-2").andExpect(status().isNoContent());
    }

    @Test
    void expiredAndMadeUpLinksAreRejected() throws Exception {
        String email = nextUniqueEmail();
        registerUserAndGetToken(email, "password123");
        forgot(email).andExpect(status().isAccepted());
        String token = tokenFrom(awaitEmailTo(email));

        jdbcTemplate.update("UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' "
                + "WHERE user_id = (SELECT id FROM users WHERE email = ?)", email);
        reset(token, "new-password-2").andExpect(status().isBadRequest());
        reset("made-up-token", "new-password-2").andExpect(status().isBadRequest());
        login(email, "password123").andExpect(status().isOk());
    }

    @Test
    void onlyTheHashOfTheLinkIsStored() throws Exception {
        String email = nextUniqueEmail();
        registerUserAndGetToken(email, "password123");
        forgot(email).andExpect(status().isAccepted());
        String token = tokenFrom(awaitEmailTo(email));

        Integer rawStored = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM password_reset_tokens WHERE token_hash = ?", Integer.class, token);
        assertEquals(0, rawStored);
    }

    @Test
    void invalidInputIsRejectedWithoutLeakingAnything() throws Exception {
        forgot("not-an-email").andExpect(status().isBadRequest());
        reset("some-token", "short").andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/auth/reset-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"long-enough-1\"}"))
                .andExpect(status().isBadRequest());
    }

    // ---- helpers ----

    private ResultActions forgot(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/forgot-password")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\"}"));
    }

    private ResultActions reset(String token, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/reset-password")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"password\":\"" + password + "\"}"));
    }

    private ResultActions login(String email, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"));
    }

    // The email is sent in the background, so wait for it (up to 5 seconds).
    private Email awaitEmailTo(String address) throws InterruptedException {
        for (int i = 0; i < 100; i++) {
            for (Email email : mail.sent) {
                if (email.to().equals(address)) {
                    return email;
                }
            }
            Thread.sleep(50);
        }
        throw new AssertionError("No email was sent to " + address);
    }

    private static String tokenFrom(Email email) {
        Matcher matcher = TOKEN_IN_LINK.matcher(email.text());
        assertTrue(matcher.find(), "No reset link in the email");
        return matcher.group(1);
    }
}
