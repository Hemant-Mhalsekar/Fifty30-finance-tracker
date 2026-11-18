package com.financetracker.settings;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.financetracker.user.DisplayNames;
import com.financetracker.user.User;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Settings")
@RestController
@RequestMapping("/api/settings")
public class SettingsController {

    public record PayDayRequest(
            @NotNull(message = "Pay day is required")
            @Min(value = 1, message = "Pay day must be between 1 and 31")
            @Max(value = 31, message = "Pay day must be between 1 and 31")
            Integer payDay) {
    }

    // Blank or missing name clears it. showName is optional: left out, the setting stays as it is.
    public record NameRequest(String name, Boolean showName) {
    }

    public record NameView(String name, boolean showName) {
    }

    // null removes it.
    public record OpeningBalanceRequest(
            @Min(value = 0, message = "Opening balance must be between ₹0 and ₹10,00,00,00,000")
            @Max(value = 100_000_000_000L, message = "Opening balance must be between ₹0 and ₹10,00,00,00,000")
            Long openingBalancePaise) {
    }

    public record OpeningBalanceView(Long openingBalancePaise) {
    }

    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @Operation(summary = "Set or remove your opening balance",
            description = "Savings you had before using the app; the starting point of total savings."
                    + " null removes it. It never changes a cycle's budget.")
    @PutMapping("/opening-balance")
    public OpeningBalanceView changeOpeningBalance(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody OpeningBalanceRequest request) {
        settingsService.changeOpeningBalance(UUID.fromString(jwt.getSubject()), request.openingBalancePaise());
        return new OpeningBalanceView(request.openingBalancePaise());
    }

    @Operation(summary = "Set your name and whether the greeting shows it",
            description = "Up to 50 characters; blank clears it. showName false greets without the name"
                    + " but keeps it saved.")
    @PutMapping("/name")
    public NameView changeName(@AuthenticationPrincipal Jwt jwt, @RequestBody NameRequest request) {
        User user = settingsService.changeName(UUID.fromString(jwt.getSubject()),
                DisplayNames.normalize(request.name()), request.showName());
        return new NameView(user.getDisplayName(), user.isShowName());
    }

    @Operation(summary = "Schedule a pay day change",
            description = "Waits one full cycle. Sending the current pay day cancels a pending change.")
    @PutMapping("/pay-day")
    public PayDaySettingsView changePayDay(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody PayDayRequest request) {
        return settingsService.changePayDay(UUID.fromString(jwt.getSubject()), request.payDay());
    }
}
