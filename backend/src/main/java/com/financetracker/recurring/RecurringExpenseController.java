package com.financetracker.recurring;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
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
import org.springframework.web.bind.annotation.RestController;

import com.financetracker.common.BudgetType;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Recurring expenses")
@RestController
@RequestMapping("/api/recurring-expenses")
public class RecurringExpenseController {

    public record CreateRequest(
            UUID categoryId,
            BudgetType type,
            Long amountPaise,
            String description,
            Integer dayOfMonth) {
    }

    public record UpdateRequest(
            UUID categoryId,
            BudgetType type,
            Long amountPaise,
            String description,
            Integer dayOfMonth,
            Boolean paused) {
    }

    public record ConfirmRequest(
            @NotNull(message = "Due date is required")
            LocalDate dueDate,

            @NotNull(message = "Amount is required")
            Long amountPaise,

            LocalDate expenseDate) {
    }

    public record SkipRequest(
            @NotNull(message = "Due date is required")
            LocalDate dueDate) {
    }

    private final RecurringExpenseService service;

    public RecurringExpenseController(RecurringExpenseService service) {
        this.service = service;
    }

    @Operation(summary = "List recurring expenses", description = "Due ones first.")
    @GetMapping
    public List<RecurringExpenseView> list(@AuthenticationPrincipal Jwt jwt) {
        return service.list(userId(jwt));
    }

    @Operation(summary = "Create a recurring expense",
            description = "Monthly on a day of the month;"
                    + " days 29 to 31 fall on the last day of shorter months.")
    @PostMapping
    public ResponseEntity<RecurringExpenseView> create(
            @AuthenticationPrincipal Jwt jwt,
            @RequestBody CreateRequest request) {
        RecurringExpenseView created = service.create(
                userId(jwt),
                request.categoryId(),
                request.type(),
                request.amountPaise(),
                request.description(),
                request.dayOfMonth());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "Update, pause or resume a recurring expense")
    @PutMapping("/{id}")
    public RecurringExpenseView update(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @RequestBody UpdateRequest request) {
        return service.update(
                userId(jwt),
                id,
                request.categoryId(),
                request.type(),
                request.amountPaise(),
                request.description(),
                request.dayOfMonth(),
                request.paused());
    }

    @Operation(summary = "Delete a recurring expense", description = "Expenses already logged from it stay.")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        service.delete(userId(jwt), id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Log the due month as an expense",
            description = "dueDate must be the month waiting for an answer, otherwise 409.")
    @PostMapping("/{id}/confirm")
    public ResponseEntity<RecurringExpenseService.ConfirmResult> confirm(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody ConfirmRequest request) {
        RecurringExpenseService.ConfirmResult result = service.confirm(
                userId(jwt), id, request.dueDate(), request.amountPaise(), request.expenseDate());
        return ResponseEntity.status(HttpStatus.CREATED).body(result);
    }

    @Operation(summary = "Skip the due month")
    @PostMapping("/{id}/skip")
    public RecurringExpenseView skip(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody SkipRequest request) {
        return service.skip(userId(jwt), id, request.dueDate());
    }

    private static UUID userId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
