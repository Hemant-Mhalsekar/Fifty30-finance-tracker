package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.JsonNode;

// Split presets, a bonus for one cycle, and the opening balance.
class SplitBonusBalanceIntegrationTest extends AbstractIntegrationTest {

    private static final long SALARY = 10_000_000L; // ₹1,00,000

    @Autowired
    private Clock clock;

    @Test
    void setupTakesASplitPresetAndAnOpeningBalance() throws Exception {
        String token = registerUserAndGetToken();
        mockMvc.perform(json(post("/api/onboarding"), token,
                        "{\"salaryPaise\":" + SALARY + ",\"payDay\":" + payDay()
                                + ",\"split\":\"HIGH_RENT\",\"openingBalancePaise\":25000000}"))
                .andExpect(status().isCreated());

        JsonNode cycle = current(token);
        assertEquals(60, cycle.path("needsPct").asInt());
        assertEquals(20, cycle.path("wantsPct").asInt());
        assertEquals(20, cycle.path("savingsPct").asInt());
        assertEquals(6_000_000L, cycle.path("needsPaise").asLong());
        assertEquals(0, cycle.path("bonusPaise").asLong());
        assertEquals(25_000_000L, me(token).path("openingBalancePaise").asLong());

        // Changed in Settings, and removed.
        mockMvc.perform(json(put("/api/settings/opening-balance"), token, "{\"openingBalancePaise\":30000000}"))
                .andExpect(status().isOk());
        assertEquals(30_000_000L, me(token).path("openingBalancePaise").asLong());
        mockMvc.perform(json(put("/api/settings/opening-balance"), token, "{\"openingBalancePaise\":-1}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(json(put("/api/settings/opening-balance"), token, "{\"openingBalancePaise\":null}"))
                .andExpect(status().isOk());
        assertTrue(me(token).path("openingBalancePaise").isNull());
    }

    @Test
    void withoutAChoiceSetupUses503020AndNoOpeningBalance() throws Exception {
        String token = registerUserAndGetToken();
        onboardUser(token, SALARY, payDay());
        JsonNode cycle = current(token);
        assertEquals(50, cycle.path("needsPct").asInt());
        assertEquals(20, cycle.path("savingsPct").asInt());
        assertTrue(me(token).path("openingBalancePaise").isNull());

        // Only the four presets are accepted.
        mockMvc.perform(json(put("/api/cycles/current/split"), token, "{\"split\":\"ALL_WANTS\"}"))
                .andExpect(status().isBadRequest());
        cycle = jsonMapper.readTree(mockMvc.perform(json(put("/api/cycles/current/split"), token,
                        "{\"split\":\"LOW_COST\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertEquals(4_000_000L, cycle.path("needsPaise").asLong());
        assertEquals(3_000_000L, cycle.path("wantsPaise").asLong());
        assertEquals(3_000_000L, cycle.path("savingsPaise").asLong());
    }

    @Test
    void aBonusIsSplitLikeSalaryCountsAsSavedAndDoesNotCarryOver() throws Exception {
        String token = registerUserAndGetToken();
        onboardUser(token, SALARY, payDay());
        mockMvc.perform(json(put("/api/cycles/current/split"), token, "{\"split\":\"SAVER\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(json(put("/api/cycles/current/bonus"), token, "{\"bonusPaise\":-100}"))
                .andExpect(status().isBadRequest());
        JsonNode cycle = jsonMapper.readTree(mockMvc.perform(json(put("/api/cycles/current/bonus"), token,
                        "{\"bonusPaise\":2000000}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        // ₹1,20,000 split 50/20/30.
        assertEquals(2_000_000L, cycle.path("bonusPaise").asLong());
        assertEquals(SALARY, cycle.path("salaryPaise").asLong());
        assertEquals(6_000_000L, cycle.path("needsPaise").asLong());
        assertEquals(2_400_000L, cycle.path("wantsPaise").asLong());
        assertEquals(3_600_000L, cycle.path("savingsPaise").asLong());

        // A salary change keeps the bonus and the split.
        cycle = jsonMapper.readTree(mockMvc.perform(json(put("/api/cycles/current/salary"), token,
                        "{\"salaryPaise\":8000000}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertEquals(5_000_000L, cycle.path("needsPaise").asLong());

        // Unspent bonus counts as saved, and the history agrees.
        JsonNode report = jsonMapper.readTree(mockMvc.perform(get("/api/cycles/current/report")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertEquals(10_000_000L, report.path("savings").path("savedPaise").asLong());
        JsonNode history = jsonMapper.readTree(mockMvc.perform(get("/api/reports/cycles")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertEquals(10_000_000L, history.path(0).path("savedPaise").asLong());

        // The next cycle keeps the salary and split but not the bonus.
        LocalDate today = LocalDate.now(clock);
        jdbcTemplate.update(
                "UPDATE cycles SET period_end = ? WHERE user_id = ? AND period_start <= ? AND period_end >= ?",
                today.minusDays(1), userId(token), today, today);
        JsonNode next = current(token);
        assertEquals(today.toString(), next.path("periodStart").asText());
        assertEquals(0, next.path("bonusPaise").asLong());
        assertEquals(8_000_000L, next.path("salaryPaise").asLong());
        assertEquals(30, next.path("savingsPct").asInt());
        assertEquals(4_000_000L, next.path("needsPaise").asLong());
        assertEquals(2_400_000L, next.path("savingsPaise").asLong());
    }

    // A pay day a few days back, so the current cycle never starts today (the test ends it yesterday).
    private int payDay() {
        return Math.min(28, LocalDate.now(clock).minusDays(3).getDayOfMonth());
    }

    private UUID userId(String token) throws Exception {
        return UUID.fromString(me(token).path("id").asText());
    }

    private JsonNode current(String token) throws Exception {
        return jsonMapper.readTree(mockMvc.perform(get("/api/cycles/current")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode me(String token) throws Exception {
        return jsonMapper.readTree(mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String token,
            String content) {
        return request.header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(content);
    }
}
