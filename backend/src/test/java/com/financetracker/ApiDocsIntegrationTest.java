package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MvcResult;

import tools.jackson.databind.JsonNode;

class ApiDocsIntegrationTest extends AbstractIntegrationTest {

    @Test
    void openApiDescriptionIsPublicAndMarksWhichEndpointsNeedAToken() throws Exception {
        String json = mockMvc.perform(get("/api/docs/openapi"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode docs = jsonMapper.readTree(json);

        assertEquals("Fifty30 API", docs.path("info").path("title").asText());
        // Relative, so "Try it out" goes through whichever site served the page.
        assertEquals("/", docs.path("servers").path(0).path("url").asText());
        JsonNode bearer = docs.path("components").path("securitySchemes").path("bearerAuth");
        assertEquals("bearer", bearer.path("scheme").asText());
        assertTrue(docs.path("security").path(0).has("bearerAuth"), "Endpoints need a token unless marked otherwise");

        JsonNode paths = docs.path("paths");
        for (String path : new String[] {"/api/auth/login", "/api/me", "/api/expenses", "/api/expenses/export",
                "/api/recurring-expenses/{id}/confirm", "/api/reports/weekly", "/api/account/deletion"}) {
            assertTrue(paths.has(path), "Missing " + path);
        }
        paths.properties().forEach(entry ->
                assertTrue(entry.getKey().startsWith("/api/"), "Unexpected path " + entry.getKey()));

        // Public endpoints show no lock; the rest use the global bearer requirement.
        JsonNode login = paths.path("/api/auth/login").path("post");
        assertTrue(login.has("security") && login.path("security").isEmpty(), "Login must not ask for a token");
        assertTrue(paths.path("/api/ping").path("get").path("security").isEmpty());
        JsonNode me = paths.path("/api/me").path("get");
        assertFalse(me.has("security"), "/api/me uses the global token requirement");
        assertEquals("User", me.path("tags").path(0).asText());
        // The JWT principal comes from the token, not from the caller, so it is not a parameter.
        assertFalse(me.has("parameters"), "Unexpected parameters on /api/me: " + me.path("parameters"));
        assertEquals("Download expenses as CSV",
                paths.path("/api/expenses/export").path("get").path("summary").asText());
    }

    @Test
    void docsPageOpensWithoutLoggingInAndStaysUnderApi() throws Exception {
        MvcResult redirect = mockMvc.perform(get("/api/docs"))
                .andExpect(status().is3xxRedirection())
                .andReturn();
        String location = redirect.getResponse().getHeader(HttpHeaders.LOCATION);
        assertNotNull(location);
        URI page = URI.create(location);
        // Vercel forwards only /api/* to the backend, so the page and its files must live there.
        assertTrue(page.getPath().startsWith("/api/"), "Docs page outside /api: " + location);

        String html = mockMvc.perform(get(page.getPath()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertTrue(html.contains("swagger-ui"), "Not the Swagger UI page");

        String config = mockMvc.perform(get("/api/docs/openapi/swagger-config"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertTrue(config.contains("/api/docs/openapi"), config);

        // The docs being public must not open anything else.
        mockMvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
    }
}
