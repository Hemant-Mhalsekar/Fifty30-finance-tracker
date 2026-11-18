package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

class ExpenseExportIntegrationTest extends AbstractIntegrationTest {

    private static final String HEADER = "Date,Description,Category,Type,Amount (INR)";

    @Autowired
    private Clock clock;

    @Test
    void exportsTheCallersExpensesOldestFirstAsSafeCsv() throws Exception {
        mockMvc.perform(get("/api/expenses/export")).andExpect(status().isUnauthorized());

        String token = registerUserAndGetToken();
        String other = registerUserAndGetToken();
        onboardUser(token);
        onboardUser(other);
        LocalDate today = LocalDate.now(clock);
        LocalDate earlier = today.minusDays(3);

        logExpense(token, "Dining", 50_000L, "=cmd()", today, null);
        logExpense(token, "Groceries", 123_456L, "Rice, dal", earlier, null);
        logExpense(token, "Other", 99L, "Gift", earlier, "WANT");
        logExpense(other, "Dining", 1L, "Someone else's tea", today, null);

        MvcResult all = mockMvc.perform(get("/api/expenses/export").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "text/csv;charset=UTF-8"))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"fifty30-expenses.csv\""))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andReturn();
        String body = all.getResponse().getContentAsString(StandardCharsets.UTF_8);
        // The byte order mark makes Excel read the file as UTF-8.
        assertTrue(body.startsWith("﻿"));
        assertEquals(List.of(
                HEADER,
                earlier + ",\"Rice, dal\",Groceries,Need,1234.56",
                earlier + ",Gift,Other,Want,0.99",
                // A description that a spreadsheet would run as a formula is turned into text.
                today + ",'=cmd(),Dining,Want,500.00"),
                body.substring(1).lines().toList());

        // Same filters as the list: dates and category, and the file name says which dates.
        String dining = findCategoryIdByName(token, "Dining").toString();
        MvcResult filtered = mockMvc.perform(get("/api/expenses/export")
                        .param("from", earlier.toString())
                        .param("to", today.toString())
                        .param("categoryId", dining)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"fifty30-expenses-" + earlier + "-to-" + today + ".csv\""))
                .andReturn();
        assertEquals(List.of(HEADER, today + ",'=cmd(),Dining,Want,500.00"),
                filtered.getResponse().getContentAsString(StandardCharsets.UTF_8).substring(1).lines().toList());

        mockMvc.perform(get("/api/expenses/export")
                        .param("from", today.toString())
                        .param("to", earlier.toString())
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isBadRequest());
    }

    private void logExpense(String token, String category, long amountPaise, String description, LocalDate date,
            String type) throws Exception {
        String content = "{\"amountPaise\":" + amountPaise
                + ",\"categoryId\":\"" + findCategoryIdByName(token, category) + "\""
                + ",\"description\":" + jsonMapper.writeValueAsString(description)
                + ",\"expenseDate\":\"" + date + "\""
                + (type == null ? "" : ",\"type\":\"" + type + "\"") + "}";
        mockMvc.perform(post("/api/expenses")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(content))
                .andExpect(status().isCreated());
    }
}
