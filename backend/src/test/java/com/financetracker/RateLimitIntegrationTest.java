package com.financetracker;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

// Small limits so they are reached quickly. Each test uses its own addresses and emails because
// the limiter keeps its counts for the whole Spring context.
@TestPropertySource(properties = {
        "app.rate-limit.login-per-ip=3",
        "app.rate-limit.login-per-email=2",
        "app.rate-limit.register-per-ip=2",
        "app.rate-limit.register-global=4"
})
class RateLimitIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void loginIsLimitedPerIpWithRetryAfterAndAPlainMessage() throws Exception {
        String ip = "203.0.113.10";
        for (int i = 0; i < 3; i++) {
            login(ip, "per-ip-" + i + "@example.com", "wrong-password").andExpect(status().isUnauthorized());
        }
        login(ip, "per-ip-3@example.com", "wrong-password")
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "300")) // 3 per 15 minutes: one every 5 minutes
                .andExpect(jsonPath("$.error").value("Too Many Requests"))
                .andExpect(jsonPath("$.message").value("Too many attempts. Please try again in 5 minutes."));

        // Another address is not affected.
        login("203.0.113.11", "per-ip-4@example.com", "wrong-password").andExpect(status().isUnauthorized());
    }

    @Test
    void loginIsLimitedPerEmailEvenFromChangingAddressesAndBlocksTheRightPasswordToo() throws Exception {
        // Inserted directly: registering through the API would use up the global register limit,
        // which registerIsLimitedPerIpAndGloballyEvenWithFakedAddresses depends on.
        String email = nextUniqueEmail();
        jdbcTemplate.update("INSERT INTO users (email, password_hash) VALUES (?, ?)",
                email, passwordEncoder.encode("password123"));

        login("198.51.100.21", email, "wrong-password").andExpect(status().isUnauthorized());
        login("198.51.100.22", email, "wrong-password").andExpect(status().isUnauthorized());
        // Blocked before the password is checked, so a correct guess cannot slip through.
        login("198.51.100.23", email, "password123").andExpect(status().isTooManyRequests());
        // Email case and spaces do not create a fresh bucket.
        login("198.51.100.24", "  " + email.toUpperCase() + " ", "password123").andExpect(status().isTooManyRequests());
    }

    @Test
    void registerIsLimitedPerIpAndGloballyEvenWithFakedAddresses() throws Exception {
        registerFrom("192.0.2.30", nextUniqueEmail());
        registerFrom("192.0.2.30", nextUniqueEmail());
        register("192.0.2.30", nextUniqueEmail()).andExpect(status().isTooManyRequests());

        // A new (possibly faked) address gets past the per-IP limit but not the global one (4 per hour).
        registerFrom("192.0.2.31", nextUniqueEmail());
        registerFrom("192.0.2.32", nextUniqueEmail());
        register("192.0.2.33", nextUniqueEmail()).andExpect(status().isTooManyRequests());
    }

    @Test
    void invalidRequestsAreRejectedBeforeCountingAgainstTheLimit() throws Exception {
        String ip = "203.0.113.40";
        for (int i = 0; i < 5; i++) {
            mockMvc.perform(post("/api/auth/login")
                            .header("X-Forwarded-For", ip)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"not-an-email\",\"password\":\"\"}"))
                    .andExpect(status().isBadRequest());
        }
        login(ip, "valid-format@example.com", "wrong-password").andExpect(status().isUnauthorized());
    }

    private ResultActions login(String ip, String email, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .header("X-Forwarded-For", ip + ", 76.76.21.21")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}"));
    }

    private ResultActions register(String ip, String email) throws Exception {
        return mockMvc.perform(post("/api/auth/register")
                .header("X-Forwarded-For", ip)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"password123\"}"));
    }

    private void registerFrom(String ip, String email) throws Exception {
        register(ip, email).andExpect(status().isCreated());
    }
}
