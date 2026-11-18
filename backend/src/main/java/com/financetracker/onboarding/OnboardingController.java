package com.financetracker.onboarding;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.financetracker.cycle.CycleView;
import com.financetracker.cycle.SplitPreset;
import com.financetracker.user.DisplayNames;
import com.financetracker.user.UserRepository;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Onboarding")
@RestController
public class OnboardingController {

    public record OnboardingRequest(
            @Min(value = 100, message = "Salary must be between ₹1 and ₹1,00,00,000")
            @Max(value = 1_000_000_000L, message = "Salary must be between ₹1 and ₹1,00,00,000")
            long salaryPaise,

            @Min(value = 1, message = "Pay day must be between 1 and 31")
            @Max(value = 31, message = "Pay day must be between 1 and 31")
            int payDay,

            // Optional, for the greeting.
            String name,

            // Optional; BALANCED (50/30/20) when left out.
            SplitPreset split,

            // Optional savings the user already has; null when they said no.
            @Min(value = 0, message = "Opening balance must be between ₹0 and ₹10,00,00,00,000")
            @Max(value = 100_000_000_000L, message = "Opening balance must be between ₹0 and ₹10,00,00,00,000")
            Long openingBalancePaise) {
    }

    public record OnboardingResponse(int payDay, CycleView cycle) {
    }

    private final OnboardingService onboardingService;
    private final UserRepository users;

    public OnboardingController(OnboardingService onboardingService, UserRepository users) {
        this.onboardingService = onboardingService;
        this.users = users;
    }

    @Operation(summary = "Set salary and pay day",
            description = "Once per account. Creates the first cycle and the default categories."
                    + " split (default BALANCED), openingBalancePaise and name are optional.")
    @PostMapping("/api/onboarding")
    public ResponseEntity<OnboardingResponse> onboard(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody OnboardingRequest request) {
        UUID userId = UUID.fromString(jwt.getSubject());
        // Checked before onboarding so a bad name cannot leave setup half done.
        String name = DisplayNames.normalize(request.name());
        CycleView cycle = onboardingService.onboard(userId, request.salaryPaise(), request.payDay(),
                request.split() != null ? request.split() : SplitPreset.BALANCED, request.openingBalancePaise());
        if (name != null) {
            users.updateDisplayName(userId, name);
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new OnboardingResponse(request.payDay(), cycle));
    }
}

