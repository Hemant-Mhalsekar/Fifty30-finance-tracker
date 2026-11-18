package com.financetracker;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.util.Set;
import java.util.TreeSet;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MvcResult;

import com.financetracker.config.ApiResponsesConfig;

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
        // Bean Validation helpers (isPasswordWithinBcryptLimit) are not request fields.
        JsonNode schemas = docs.path("components").path("schemas");
        for (String schema : new String[] {"LoginRequest", "RegisterRequest", "ResetPasswordRequest"}) {
            JsonNode properties = schemas.path(schema).path("properties");
            assertTrue(properties.has("password"), schema + " should list password");
            assertFalse(properties.has("passwordWithinBcryptLimit"), schema + " leaks a validation helper");
        }
        assertEquals("Download expenses as CSV",
                paths.path("/api/expenses/export").path("get").path("summary").asText());
    }

    @Test
    void everyEndpointListsItsRealStatusCodesAndErrorMessages() throws Exception {
        JsonNode docs = jsonMapper.readTree(mockMvc.perform(get("/api/docs/openapi"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        JsonNode paths = docs.path("paths");

        // The table in ApiResponsesConfig and the endpoints must match both ways.
        Set<String> onPage = new TreeSet<>();
        paths.properties().forEach(path -> path.getValue().properties().forEach(method ->
                onPage.add(method.getKey().toUpperCase() + " " + path.getKey())));
        Set<String> missing = new TreeSet<>(onPage);
        missing.removeAll(ApiResponsesConfig.documentedEndpoints());
        assertTrue(missing.isEmpty(), "Add these to ApiResponsesConfig.DOCS: " + missing);
        Set<String> stale = new TreeSet<>(ApiResponsesConfig.documentedEndpoints());
        stale.removeAll(onPage);
        assertTrue(stale.isEmpty(), "No longer endpoints: " + stale);

        JsonNode schemas = docs.path("components").path("schemas");
        assertTrue(schemas.path("ApiError").path("properties").has("message"));
        assertFalse(docs.toString().contains("\"*/*\""), "Every answer should name its media type");

        // Created, accepted and no-content answers, not a blanket 200.
        JsonNode register = paths.path("/api/auth/register").path("post").path("responses");
        assertFalse(register.has("200"));
        assertEquals("#/components/schemas/TokenResponse",
                register.path("201").path("content").path("application/json").path("schema").path("$ref").asText());
        assertEquals("Unable to register with these details",
                register.path("409").path("content").path("application/json").path("example").path("message")
                        .asText());
        assertTrue(register.path("429").path("headers").has("Retry-After"));
        assertFalse(register.has("401"), "Register needs no token");
        JsonNode delete = paths.path("/api/expenses/{id}").path("delete").path("responses");
        assertTrue(delete.has("204") && !delete.path("204").has("content"), "204 has no body: " + delete);
        assertTrue(paths.path("/api/auth/forgot-password").path("post").path("responses").has("202"));

        // Shared errors are added to every endpoint they apply to.
        JsonNode create = paths.path("/api/expenses").path("post").path("responses");
        assertEquals("Missing or invalid access token",
                create.path("401").path("content").path("application/json").path("example").path("message")
                        .asText());
        String badRequest = create.path("400").path("description").asText();
        assertTrue(badRequest.contains("Malformed request body") && badRequest.contains("Date cannot be in the future"),
                badRequest);
        assertEquals("Not Found",
                create.path("404").path("content").path("application/json").path("example").path("error").asText());
        assertTrue(paths.path("/api/expenses/{id}").path("put").path("responses").path("400").path("description")
                .asText().contains("Invalid value for parameter 'id'"));
        assertEquals("#/components/schemas/ApiError", create.path("409").path("content").path("application/json")
                .path("schema").path("$ref").asText());

        assertTrue(paths.path("/api/expenses/export").path("get").path("responses").path("200").path("content")
                .has("text/csv"));
        assertTrue(paths.path("/api/health").path("get").path("responses").has("503"));
        assertEquals("Name, opening balance and pay day changes.", docs.path("tags").findValues("description")
                .stream().filter(node -> node.asText().startsWith("Name,")).findFirst().orElseThrow().asText());
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
