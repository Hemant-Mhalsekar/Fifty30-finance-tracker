package com.financetracker.config;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;

import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.headers.Header;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.parameters.Parameter;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;

// The real status codes and error messages of every endpoint, for the docs page. springdoc cannot
// see them: controllers return ResponseEntity and services throw ResponseStatusException.
// Kept in one table so it is easy to compare with the services; ApiDocsIntegrationTest fails when
// an endpoint is missing here or an entry no longer matches an endpoint.
@Configuration
public class ApiResponsesConfig {

    static final String API_ERROR = "ApiError";

    private static final String JSON = "application/json";
    private static final String SETUP_FIRST = "Complete setup first";
    private static final String SALARY_RANGE = "Salary must be between ₹1 and ₹1,00,00,000";
    private static final String PAY_DAY_RANGE = "Pay day must be between 1 and 31";
    private static final String OPENING_RANGE = "Opening balance must be between ₹0 and ₹10,00,00,00,000";
    private static final String AMOUNT_RANGE = "Amount must be between ₹0.01 and ₹10,00,00,000";
    private static final String NAME_LENGTH = "Name must be at most 50 characters";
    private static final String NAME_CHARACTERS = "Name contains characters that are not allowed";
    private static final String PASSWORD_SHORT = "Password must be at least 8 characters";
    private static final String PASSWORD_LONG = "Password must be at most 72 bytes";
    private static final String TYPE_REQUIRED = "Type is required for this category";
    private static final String TYPE_NOT_ALLOWED = "Type can only be set for categories without a fixed type";
    private static final String ARCHIVED = "This category is archived";
    private static final String DUPLICATE_CATEGORY =
            "A category with this name already exists. If it is archived, restore it instead.";
    private static final String NO_CYCLE = "No cycle contains that date";

    record Error(int status, List<String> messages) {
    }

    record Doc(int status, String description, String mediaType, List<Error> errors) {
    }

    // Key: "METHOD /path" exactly as on the docs page.
    static final Map<String, Doc> DOCS = Map.ofEntries(
            // Auth
            doc("POST /api/auth/register", 201, "Account created. Sets the refresh cookie.",
                    err(400, "Email is required", "Email is not valid", "Email must be at most 254 characters",
                            "Password is required", PASSWORD_SHORT, PASSWORD_LONG, "Name is required",
                            NAME_LENGTH, NAME_CHARACTERS),
                    err(409, "Unable to register with these details"),
                    err(429)),
            doc("POST /api/auth/login", 200, "Logged in. Sets the refresh cookie.",
                    err(400, "Email is required", "Email must be at most 254 characters", "Password is required",
                            PASSWORD_LONG),
                    err(401, "Invalid email or password"),
                    err(429)),
            doc("POST /api/auth/forgot-password", 202,
                    "Accepted. An email is sent only if the account exists; the answer is the same either way.",
                    err(400, "Email is required", "Email is not valid", "Email must be at most 254 characters"),
                    err(429)),
            doc("POST /api/auth/reset-password", 204, "Password changed. Every session is ended.",
                    err(400, "This reset link is invalid or has expired. Request a new one.",
                            "Reset link is missing", "Reset link is not valid", "Password is required",
                            PASSWORD_SHORT, PASSWORD_LONG)),
            doc("POST /api/auth/refresh", 200, "New access token. The refresh cookie is rotated.",
                    err(401, "Invalid refresh token")),
            doc("POST /api/auth/logout", 204, "Logged out. The refresh cookie is cleared."),

            // Onboarding and user
            doc("POST /api/onboarding", 201, "Setup done. Returns the first cycle.",
                    err(400, SALARY_RANGE, PAY_DAY_RANGE, OPENING_RANGE, NAME_LENGTH, NAME_CHARACTERS),
                    err(409, "Setup already completed")),
            doc("GET /api/me", 200, "The logged-in user."),

            // Cycles
            doc("GET /api/cycles/current", 200, "The current cycle.", err(409, SETUP_FIRST)),
            doc("PUT /api/cycles/current/salary", 200, "The re-split current cycle.",
                    err(400, "Salary is required", SALARY_RANGE),
                    err(409, SETUP_FIRST)),
            doc("PUT /api/cycles/current/split", 200, "The re-split current cycle.",
                    err(400, "Split is required"),
                    err(409, SETUP_FIRST)),
            doc("PUT /api/cycles/current/bonus", 200, "The re-split current cycle.",
                    err(400, "Bonus is required", "Bonus must be between ₹0 and ₹1,00,00,000"),
                    err(409, SETUP_FIRST)),
            doc("POST /api/cycles/current/salary/confirm", 200, "The current cycle, now answered.",
                    err(409, SETUP_FIRST)),
            doc("GET /api/cycles/current/report", 200, "The current cycle's report.", err(409, SETUP_FIRST)),
            doc("GET /api/cycles/report", 200, "The report of the cycle containing the date.",
                    err(404, NO_CYCLE),
                    err(409, SETUP_FIRST)),
            doc("GET /api/cycles/history", 200, "Cycles with their totals, oldest first.",
                    err(400, "Count must be between 1 and 12"),
                    err(404, NO_CYCLE),
                    err(409, SETUP_FIRST)),

            // Expenses
            doc("GET /api/expenses", 200, "One page of matching expenses.",
                    err(400, "From date must not be after to date", "Search must be at most 100 characters",
                            "Page must be at least 0", "Size must be between 1 and 100")),
            doc("POST /api/expenses", 201,
                    "Logged. With a clientId already used, the stored expense is returned unchanged.",
                    err(400, "Amount is required", AMOUNT_RANGE, "Category is required", "Description is required",
                            "Description must be at most 200 characters", "Date cannot be in the future",
                            "Date is too far in the past", TYPE_REQUIRED, TYPE_NOT_ALLOWED),
                    err(404, "Category not found"),
                    err(409, ARCHIVED, "Expense limit reached")),
            doc("PUT /api/expenses/{id}", 200, "The edited expense.",
                    err(400, "Amount is required", AMOUNT_RANGE, "Category is required", "Description is required",
                            "Description must be at most 200 characters", "Date cannot be in the future",
                            "Date is too far in the past", TYPE_REQUIRED, TYPE_NOT_ALLOWED),
                    err(404, "Expense not found", "Category not found"),
                    err(409, ARCHIVED)),
            doc("DELETE /api/expenses/{id}", 204, "Deleted.", err(404, "Expense not found")),
            doc("GET /api/expenses/export", 200, "The CSV file (UTF-8 with a byte order mark).", "text/csv",
                    List.of(err(400, "From date must not be after to date",
                            "Search must be at most 100 characters"))),

            // Categories
            doc("GET /api/categories", 200, "Categories, archived ones only when asked."),
            doc("POST /api/categories", 201, "Created.",
                    err(400, "Name is required", NAME_LENGTH, "Type is required"),
                    err(409, DUPLICATE_CATEGORY, "Category limit reached")),
            doc("PATCH /api/categories/{id}", 200, "The changed category.",
                    err(400, "Nothing to update", "Name is required", NAME_LENGTH),
                    err(404, "Category not found"),
                    err(409, "This category cannot be changed", DUPLICATE_CATEGORY)),
            doc("DELETE /api/categories/{id}", 204, "Deleted.",
                    err(404, "Category not found"),
                    err(409, "This category has expenses. Archive it instead.",
                            "A recurring expense uses this category. Delete or change it first, or archive the"
                                    + " category.",
                            "This category cannot be changed")),

            // Recurring expenses
            doc("GET /api/recurring-expenses", 200, "Recurring expenses, due ones first."),
            doc("POST /api/recurring-expenses", 201, "Created.",
                    err(400, "Category is required", "Amount is required", AMOUNT_RANGE, "Description is required",
                            "Description must be at most 200 characters", "Day of month must be between 1 and 31",
                            TYPE_REQUIRED, TYPE_NOT_ALLOWED),
                    err(404, "Category not found"),
                    err(409, ARCHIVED, "Recurring expense limit reached")),
            doc("PUT /api/recurring-expenses/{id}", 200, "The changed recurring expense.",
                    err(400, "Category is required", "Amount is required", AMOUNT_RANGE, "Description is required",
                            "Description must be at most 200 characters", "Day of month must be between 1 and 31",
                            "Paused is required", TYPE_REQUIRED, TYPE_NOT_ALLOWED),
                    err(404, "Recurring expense not found", "Category not found"),
                    err(409, ARCHIVED)),
            doc("DELETE /api/recurring-expenses/{id}", 204, "Deleted. Expenses already logged from it stay.",
                    err(404, "Recurring expense not found")),
            doc("POST /api/recurring-expenses/{id}/confirm", 201, "The logged expense and the moved recurring one.",
                    err(400, "Due date is required", "Amount is required", AMOUNT_RANGE,
                            "Date cannot be in the future", "Date is too far in the past"),
                    err(404, "Recurring expense not found"),
                    err(409, "This payment was already handled", "This payment is not due yet",
                            "This recurring expense is paused", ARCHIVED)),
            doc("POST /api/recurring-expenses/{id}/skip", 200, "The recurring expense, moved to the next month.",
                    err(400, "Due date is required"),
                    err(404, "Recurring expense not found"),
                    err(409, "This payment was already handled", "This payment is not due yet",
                            "This recurring expense is paused")),

            // Reports
            doc("GET /api/reports/cycles", 200, "Every cycle with its totals, oldest first.", err(409, SETUP_FIRST)),
            doc("GET /api/reports/weekly", 200, "Daily totals and the cycles they fall in.",
                    err(400, "Weeks must be between 1 and 26"),
                    err(409, SETUP_FIRST)),

            // Settings and account
            doc("PUT /api/settings/pay-day", 200, "The pay day and any pending change.",
                    err(400, "Pay day is required", PAY_DAY_RANGE),
                    err(409, SETUP_FIRST)),
            doc("PUT /api/settings/opening-balance", 200, "The saved opening balance (null when removed).",
                    err(400, OPENING_RANGE)),
            doc("PUT /api/settings/name", 200, "The saved name and greeting setting.",
                    err(400, NAME_LENGTH, NAME_CHARACTERS)),
            doc("POST /api/account/deletion", 202, "Deletion scheduled. Every session is ended.",
                    err(400, "Password is required", "Password is incorrect"),
                    err(429)),

            // Health
            doc("GET /api/ping", 200, "The server is up."),
            doc("GET /api/health", 200, "Server and database are up.", err(503)));

    @Bean
    OpenApiCustomizer documentedResponses() {
        return openApi -> {
            openApi.getComponents().addSchemas(API_ERROR, new ObjectSchema()
                    .description("Every error answer has this shape.")
                    .addProperty("error", new StringSchema().example("Bad Request"))
                    .addProperty("message", new StringSchema().example("Amount is required")));
            openApi.getPaths().forEach((path, item) -> item.readOperationsMap().forEach((method, operation) -> {
                Doc doc = DOCS.get(method.name() + " " + path);
                if (doc != null) {
                    apply(operation, doc, OpenApiConfig.isPublic(path));
                }
            }));
        };
    }

    // For the test that keeps this table and the endpoints in step.
    public static Set<String> documentedEndpoints() {
        return DOCS.keySet();
    }

    private static void apply(Operation operation, Doc doc, boolean isPublic) {
        ApiResponses responses = operation.getResponses();
        ApiResponse success = responses.remove("200");
        if (success == null) {
            success = new ApiResponse();
        }
        success.setDescription(doc.description());
        if (doc.status() == 204 || (doc.status() == 202 && isEmpty(success))) {
            success.setContent(null);
        } else if (doc.mediaType() != null && success.getContent() != null) {
            success.setContent(new Content().addMediaType(doc.mediaType(), new MediaType()
                    .schema(new StringSchema().description("CSV text"))));
        }
        responses.addApiResponse(String.valueOf(doc.status()), success);

        Map<Integer, List<String>> errors = new LinkedHashMap<>();
        // Problems every endpoint shares, so the table only lists what is particular to each one.
        if (operation.getRequestBody() != null) {
            errors.computeIfAbsent(400, s -> new ArrayList<>()).add("Malformed request body");
        }
        if (operation.getParameters() != null) {
            for (Parameter parameter : operation.getParameters()) {
                Schema<?> schema = parameter.getSchema();
                if (!"cookie".equals(parameter.getIn()) && schema != null && !isPlainString(schema)) {
                    errors.computeIfAbsent(400, s -> new ArrayList<>())
                            .add("Invalid value for parameter '" + parameter.getName() + "'");
                }
            }
        }
        if (!isPublic) {
            errors.computeIfAbsent(401, s -> new ArrayList<>()).add("Missing or invalid access token");
        }
        for (Error error : doc.errors()) {
            errors.computeIfAbsent(error.status(), s -> new ArrayList<>()).addAll(error.messages());
        }

        errors.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(entry -> responses.addApiResponse(String.valueOf(entry.getKey()),
                        errorResponse(entry.getKey(), entry.getValue())));
    }

    private static ApiResponse errorResponse(int status, List<String> messages) {
        String reason = HttpStatus.valueOf(status).getReasonPhrase();
        ApiResponse response = new ApiResponse();
        if (status == 503) {
            // The health check answers with its own body, not an ApiError.
            response.setDescription("The database cannot be reached.");
            response.setContent(new Content().addMediaType(JSON, new MediaType()
                    .example(Map.of("status", "ok", "db", "down", "time", "2026-11-19T10:00:00Z"))));
            return response;
        }
        if (status == 429) {
            response.setDescription("Too many attempts from this address or for this email. Wait the number of"
                    + " seconds in Retry-After.");
            response.addHeaderObject("Retry-After", new Header()
                    .description("Seconds until the next attempt is allowed")
                    .schema(new IntegerSchema()));
            messages = List.of("Too many attempts. Please try again in 15 minutes.");
        } else {
            response.setDescription(messages.stream().distinct()
                    .map(message -> "- " + message)
                    .collect(Collectors.joining("\n", "`message` is one of:\n\n", "")));
        }
        response.setContent(new Content().addMediaType(JSON, new MediaType()
                .schema(new Schema<>().$ref("#/components/schemas/" + API_ERROR))
                .example(Map.of("error", reason, "message", messages.getFirst()))));
        return response;
    }

    private static boolean isEmpty(ApiResponse response) {
        return response.getContent() == null || response.getContent().isEmpty();
    }

    // A free-text parameter cannot fail to convert; dates, numbers, UUIDs and enums can.
    private static boolean isPlainString(Schema<?> schema) {
        boolean string = "string".equals(schema.getType())
                || schema.getTypes() != null && schema.getTypes().equals(Set.of("string"));
        return string && schema.getFormat() == null && schema.getEnum() == null;
    }

    private static Map.Entry<String, Doc> doc(String key, int status, String description, Error... errors) {
        return Map.entry(key, new Doc(status, description, null, List.of(errors)));
    }

    private static Map.Entry<String, Doc> doc(String key, int status, String description, String mediaType,
            List<Error> errors) {
        return Map.entry(key, new Doc(status, description, mediaType, errors));
    }

    private static Error err(int status, String... messages) {
        return new Error(status, Stream.of(messages).toList());
    }
}
