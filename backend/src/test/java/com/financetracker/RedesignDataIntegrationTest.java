package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.JsonNode;

// Data behind the redesigned screens: the greeting name, when each expense was logged,
// search and type filters, and totals that span pages.
class RedesignDataIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private Clock clock;

    @Test
    void nameIsOptionalSetDuringOnboardingOrInSettings() throws Exception {
        String token = registerUserAndGetToken();
        assertTrue(me(token).path("name").isNull());

        mockMvc.perform(post("/api/onboarding")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"salaryPaise\":5000000,\"payDay\":25,\"name\":\"  Asha   Rao \"}"))
                .andExpect(status().isCreated());
        assertEquals("Asha Rao", me(token).path("name").asText());

        mockMvc.perform(json(put("/api/settings/name"), token, "{\"name\":\"" + "a".repeat(51) + "\"}"))
                .andExpect(status().isBadRequest());
        assertEquals("Asha Rao", me(token).path("name").asText());

        mockMvc.perform(json(put("/api/settings/name"), token, "{\"name\":\"Ash\"}")).andExpect(status().isOk());
        assertEquals("Ash", me(token).path("name").asText());
        mockMvc.perform(json(put("/api/settings/name"), token, "{\"name\":\"  \"}")).andExpect(status().isOk());
        assertTrue(me(token).path("name").isNull());
    }

    @Test
    void listSearchesFiltersByTypeAndTotalsDaysAcrossPages() throws Exception {
        String token = registerUserAndGetToken();
        String other = registerUserAndGetToken();
        onboardUser(token);
        onboardUser(other);
        LocalDate today = LocalDate.now(clock);
        LocalDate earlier = today.minusDays(2);

        JsonNode created = logExpense(token, "Groceries", 10_000, "BigBasket weekly", today);
        // Logged time comes back straight away, not only when listed later.
        assertFalse(created.path("createdAt").isNull(), "createdAt missing on create: " + created);
        logExpense(token, "Groceries", 20_000, "bigbasket top-up", today);
        logExpense(token, "Dining", 30_000, "Zomato dinner", today);
        logExpense(token, "Dining", 40_000, "50% off_coffee", earlier);
        logExpense(other, "Groceries", 99_999, "BigBasket (someone else)", today);

        // Two per page: today's three expenses straddle pages 0 and 1, but each page shows the full day.
        JsonNode first = list(token, "page", "0", "size", "2");
        assertEquals(4, first.path("totalItems").asInt());
        assertEquals(100_000, first.path("totalPaise").asLong());
        assertEquals(1, first.path("dayTotals").size());
        assertEquals(today.toString(), first.path("dayTotals").path(0).path("date").asText());
        assertEquals(60_000, first.path("dayTotals").path(0).path("totalPaise").asLong());
        assertFalse(first.path("items").path(0).path("createdAt").isNull());

        JsonNode second = list(token, "page", "1", "size", "2");
        assertEquals(List.of(today.toString(), earlier.toString()), dates(second.path("dayTotals")));
        assertEquals(60_000, second.path("dayTotals").path(0).path("totalPaise").asLong());
        assertEquals(40_000, second.path("dayTotals").path(1).path("totalPaise").asLong());

        // Search: contains, any case, only the caller's expenses.
        JsonNode search = list(token, "q", "BIGBASKET");
        assertEquals(2, search.path("totalItems").asInt());
        assertEquals(30_000, search.path("totalPaise").asLong());
        // % and _ are plain characters, not wildcards.
        assertEquals(1, list(token, "q", "50% off_").path("totalItems").asInt());
        assertEquals(0, list(token, "q", "5_%").path("totalItems").asInt());

        JsonNode wants = list(token, "type", "WANT");
        assertEquals(2, wants.path("totalItems").asInt());
        assertEquals(70_000, wants.path("totalPaise").asLong());
        assertEquals(1, list(token, "type", "WANT", "q", "zomato").path("totalItems").asInt());

        JsonNode none = list(token, "q", "nothing like this");
        assertEquals(0, none.path("totalPaise").asLong());
        assertEquals(0, none.path("dayTotals").size());

        mockMvc.perform(get("/api/expenses").param("type", "SAVINGS").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/expenses").param("q", "x".repeat(101))
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest());

        // The CSV export takes the same filters.
        String csv = mockMvc.perform(get("/api/expenses/export").param("type", "NEED").param("q", "basket")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertEquals(3, csv.substring(1).lines().count(), csv);
        assertFalse(csv.contains("someone else"));
    }

    private JsonNode me(String token) throws Exception {
        return jsonMapper.readTree(mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode list(String token, String... params) throws Exception {
        MockHttpServletRequestBuilder request = get("/api/expenses").header(HttpHeaders.AUTHORIZATION, bearer(token));
        for (int i = 0; i < params.length; i += 2) {
            request.param(params[i], params[i + 1]);
        }
        return jsonMapper.readTree(mockMvc.perform(request)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static List<String> dates(JsonNode dayTotals) {
        List<String> dates = new ArrayList<>();
        dayTotals.forEach(day -> dates.add(day.path("date").asText()));
        return dates;
    }

    private JsonNode logExpense(String token, String category, long amountPaise, String description, LocalDate date)
            throws Exception {
        String content = "{\"amountPaise\":" + amountPaise
                + ",\"categoryId\":\"" + findCategoryIdByName(token, category) + "\""
                + ",\"description\":" + jsonMapper.writeValueAsString(description)
                + ",\"expenseDate\":\"" + date + "\"}";
        return jsonMapper.readTree(mockMvc.perform(json(post("/api/expenses"), token, content))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String token,
            String content) {
        return request.header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(content);
    }
}
