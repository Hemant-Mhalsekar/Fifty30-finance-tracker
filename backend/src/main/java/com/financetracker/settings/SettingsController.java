package com.financetracker.settings;

import java.util.UUID;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.financetracker.user.DisplayNames;
import com.financetracker.user.UserRepository;

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

    // Blank or missing clears the name.
    public record NameRequest(String name) {
    }

    public record NameView(String name) {
    }

    private final SettingsService settingsService;
    private final UserRepository users;

    public SettingsController(SettingsService settingsService, UserRepository users) {
        this.settingsService = settingsService;
        this.users = users;
    }

    @Operation(summary = "Set or clear your name",
            description = "Shown in the greeting. Up to 50 characters; blank clears it.")
    @PutMapping("/name")
    public NameView changeName(@AuthenticationPrincipal Jwt jwt, @RequestBody NameRequest request) {
        String name = DisplayNames.normalize(request.name());
        users.updateDisplayName(UUID.fromString(jwt.getSubject()), name);
        return new NameView(name);
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
