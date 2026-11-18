package com.financetracker.expense;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.financetracker.common.BudgetType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Expenses")
@RestController
@RequestMapping("/api/expenses")
public class ExpenseController {

    public record ExpenseRequest(
            @NotNull(message = "Amount is required")
            Long amountPaise,

            @NotNull(message = "Category is required")
            UUID categoryId,

            @NotBlank(message = "Description is required")
            @Size(max = 200, message = "Description must be at most 200 characters")
            String description,

            LocalDate expenseDate,

            BudgetType type,

            // Only for creating: an id from the phone that makes a retry safe. Ignored by PUT.
            UUID clientId) {

        public ExpenseRequest {
            if (description != null) {
                description = description.trim();
            }
        }
    }

    private final ExpenseService expenseService;
    private final ExpenseExportService exportService;

    public ExpenseController(ExpenseService expenseService, ExpenseExportService exportService) {
        this.expenseService = expenseService;
        this.exportService = exportService;
    }

    @Operation(summary = "Log an expense",
            description = "type is required for the Other category and refused for the rest."
                    + " An optional clientId makes retries safe.")
    @PostMapping
    public ResponseEntity<ExpenseView> create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ExpenseRequest request) {
        UUID userId = UUID.fromString(jwt.getSubject());
        ExpenseView created = expenseService.create(
                userId,
                request.amountPaise(),
                request.categoryId(),
                request.description(),
                request.expenseDate(),
                request.type(),
                request.clientId());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "Edit an expense")
    @PutMapping("/{id}")
    public ExpenseView update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody ExpenseRequest request) {
        UUID userId = UUID.fromString(jwt.getSubject());
        return expenseService.update(
                userId,
                id,
                request.amountPaise(),
                request.categoryId(),
                request.description(),
                request.expenseDate(),
                request.type());
    }

    @Operation(summary = "Delete an expense")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id) {
        UUID userId = UUID.fromString(jwt.getSubject());
        expenseService.delete(userId, id);
        return ResponseEntity.noContent().build();
    }

    // CSV of the expenses matching the same filters as the list (all of them when none are given).
    @Operation(summary = "Download expenses as CSV",
            description = "Same filters as the list, oldest first."
                    + " Cells that a spreadsheet would run as a formula start with an apostrophe.")
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) BudgetType type,
            @RequestParam(required = false) String q) {
        ExpenseExportService.Export export =
                exportService.export(UUID.fromString(jwt.getSubject()), from, to, categoryId, type, q);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(export.filename()).build().toString())
                // Financial data: never kept by the browser or a proxy cache.
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(export.body());
    }

    @Operation(summary = "List expenses",
            description = "Newest first. Pages start at 0; size is at most 100. q searches descriptions,"
                    + " type filters by Need/Want/Investment. totalPaise and dayTotals cover every match.")
    @GetMapping
    public ExpensePage list(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) BudgetType type,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        UUID userId = UUID.fromString(jwt.getSubject());
        return expenseService.list(userId, from, to, categoryId, type, q, page, size);
    }
}

