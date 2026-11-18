package com.financetracker.cycle;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Cycles")
@RestController
@RequestMapping("/api/cycles")
public class CycleController {

    public record SalaryRequest(
            @NotNull(message = "Salary is required")
            @Min(value = 100, message = "Salary must be between ₹1 and ₹1,00,00,000")
            @Max(value = 1_000_000_000L, message = "Salary must be between ₹1 and ₹1,00,00,000")
            Long salaryPaise) {
    }

    public record SplitRequest(@NotNull(message = "Split is required") SplitPreset split) {
    }

    // 0 removes the bonus.
    public record BonusRequest(
            @NotNull(message = "Bonus is required")
            @Min(value = 0, message = "Bonus must be between ₹0 and ₹1,00,00,000")
            @Max(value = 1_000_000_000L, message = "Bonus must be between ₹0 and ₹1,00,00,000")
            Long bonusPaise) {
    }

    private final CycleService cycleService;

    public CycleController(CycleService cycleService) {
        this.cycleService = cycleService;
    }

    // A GET that can write: it creates any missing cycles up to today. Safe to repeat.
    @Operation(summary = "The current pay cycle", description = "Creates any missing cycles up to today first.")
    @GetMapping("/current")
    public CycleView current(@AuthenticationPrincipal Jwt jwt) {
        return cycleService.getCurrent(UUID.fromString(jwt.getSubject()));
    }

    @Operation(summary = "Change the current cycle's salary", description = "Later cycles copy it.")
    @PutMapping("/current/salary")
    public CycleView changeSalary(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody SalaryRequest request) {
        return cycleService.changeCurrentSalary(UUID.fromString(jwt.getSubject()), request.salaryPaise());
    }

    @Operation(summary = "Change the current cycle's split",
            description = "One of BALANCED (50/30/20), HIGH_RENT (60/20/20), SAVER (50/20/30), LOW_COST (40/30/30)."
                    + " Later cycles copy it; past cycles keep theirs.")
    @PutMapping("/current/split")
    public CycleView changeSplit(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SplitRequest request) {
        return cycleService.changeCurrentSplit(UUID.fromString(jwt.getSubject()), request.split());
    }

    @Operation(summary = "Set the current cycle's bonus",
            description = "Extra money for this cycle only, split like the salary. 0 removes it.")
    @PutMapping("/current/bonus")
    public CycleView changeBonus(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BonusRequest request) {
        return cycleService.changeCurrentBonus(UUID.fromString(jwt.getSubject()), request.bonusPaise());
    }

    // Answers "Did your salary change?" with "No". Changing the salary answers it too.
    @Operation(summary = "Keep the salary for this cycle", description = "Answers \"Did your salary change?\" with no.")
    @PostMapping("/current/salary/confirm")
    public CycleView confirmSalary(@AuthenticationPrincipal Jwt jwt) {
        return cycleService.confirmCurrentSalary(UUID.fromString(jwt.getSubject()));
    }
}
