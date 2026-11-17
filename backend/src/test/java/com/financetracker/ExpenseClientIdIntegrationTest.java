package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

// Expenses saved offline on the phone are sent with a clientId so that retries never double them.
class ExpenseClientIdIntegrationTest extends AbstractIntegrationTest {

    @Test
    void sendingTheSameClientIdTwiceStoresOneExpense() throws Exception {
        String token = registerUserAndGetToken();
        onboardUser(token);
        UUID dining = findCategoryIdByName(token, "Dining");
        UUID clientId = UUID.randomUUID();

        String first = create(token, body(dining, 15_000L, "Lunch", clientId));
        // A retry after a lost response, even with a changed body, returns the stored expense.
        String second = create(token, body(dining, 99_900L, "Lunch again", clientId));
        assertEquals(first, second);
        assertEquals(1, countExpenses(token));

        // Without a clientId every request is a new expense, as before.
        create(token, body(dining, 15_000L, "Lunch", null));
        create(token, body(dining, 15_000L, "Lunch", null));
        assertEquals(3, countExpenses(token));
    }

    @Test
    void clientIdsAreSeparatePerUserAndMustBeUuids() throws Exception {
        String alice = registerUserAndGetToken();
        String bob = registerUserAndGetToken();
        onboardUser(alice);
        onboardUser(bob);
        UUID clientId = UUID.randomUUID();

        String aliceExpense = create(alice, body(findCategoryIdByName(alice, "Dining"), 1_000L, "Tea", clientId));
        String bobExpense = create(bob, body(findCategoryIdByName(bob, "Dining"), 2_000L, "Coffee", clientId));
        assertNotEquals(aliceExpense, bobExpense);

        mockMvc.perform(post("/api/expenses")
                        .header(HttpHeaders.AUTHORIZATION, bearer(alice))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amountPaise\":100,\"categoryId\":\"" + findCategoryIdByName(alice, "Dining")
                                + "\",\"description\":\"Bad id\",\"clientId\":\"not-a-uuid\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Malformed request body"));
    }

    private static String body(UUID categoryId, long amountPaise, String description, UUID clientId) {
        return "{\"amountPaise\":" + amountPaise + ",\"categoryId\":\"" + categoryId + "\",\"description\":\""
                + description + "\"" + (clientId == null ? "" : ",\"clientId\":\"" + clientId + "\"") + "}";
    }

    // Returns the stored expense's id.
    private String create(String token, String content) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/expenses")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(content))
                .andExpect(status().isCreated())
                .andReturn();
        return jsonMapper.readTree(result.getResponse().getContentAsString()).get("id").asText();
    }

    private long countExpenses(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/expenses").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn();
        return jsonMapper.readTree(result.getResponse().getContentAsString()).get("totalItems").asLong();
    }
}
