package com.financetracker.config;

import java.util.List;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import io.swagger.v3.oas.models.tags.Tag;

// The docs page (springdoc) at /api/docs. It is public on purpose: it lists the endpoints, but
// every endpoint outside /api/auth and the health checks still needs an access token.
@Configuration
public class OpenApiConfig {

    static final String BEARER = "bearerAuth";

    // Public endpoints, so the page does not show a lock on them.
    private static final List<String> PUBLIC_PREFIXES = List.of("/api/auth/", "/api/ping", "/api/health");

    @Bean
    OpenAPI fifty30OpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Fifty30 API")
                        .version("1")
                        .description("""
                                API behind the Fifty30 budget tracker (50/30/20 rule, pay cycles, India).

                                - Money is whole paise (1 rupee = 100 paise) as JSON integers; fractions are rejected.
                                - Dates are ISO (YYYY-MM-DD), in India time.
                                - Errors are `{"error", "message"}`. Another user's data always answers 404.

                                To try the protected endpoints: call **POST /api/auth/login**, copy `accessToken`, \
                                click **Authorize** and paste it. Tokens last 15 minutes.
                                """))
                // Relative, so "Try it out" calls the site the page was opened on (through the Vercel
                // proxy in production) instead of the Render address the backend sees.
                .servers(List.of(new Server().url("/")))
                .components(new Components().addSecuritySchemes(BEARER, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList(BEARER))
                // Listed here to fix their order on the page.
                .tags(List.of(
                        tag("Auth", "Register, log in, refresh the access token, reset a password. No token needed."),
                        tag("Onboarding", "First-time setup: take-home salary and pay day."),
                        tag("User", "The logged-in user."),
                        tag("Cycles", "Pay cycles (one pay day to the day before the next) and their reports."),
                        tag("Expenses", "Logged expenses, the filtered list and CSV export."),
                        tag("Categories", "Needs, wants and investment categories."),
                        tag("Recurring expenses", "Monthly payments that are asked about when due."),
                        tag("Reports", "Raw totals for the weekly, yearly and savings reports."),
                        tag("Settings", "Pay day changes."),
                        tag("Account", "Account deletion."),
                        tag("Health", "Liveness and database checks. No token needed.")));
    }

    @Bean
    OpenApiCustomizer publicEndpointsHaveNoLock() {
        return openApi -> openApi.getPaths().forEach((path, item) -> {
            if (PUBLIC_PREFIXES.stream().anyMatch(path::startsWith)) {
                item.readOperations().forEach(operation -> operation.setSecurity(List.of()));
            }
        });
    }

    private static Tag tag(String name, String description) {
        return new Tag().name(name).description(description);
    }
}
