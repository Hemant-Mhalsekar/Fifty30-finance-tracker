package com.financetracker.user;

import java.time.LocalDate;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "User")
@RestController
public class MeController {

    // pendingPayDay and pendingPayDayFrom are null unless a pay day change is scheduled; name is null until given.
    public record MeResponse(UUID id, String email, String name, Short payDay, Short pendingPayDay,
            LocalDate pendingPayDayFrom) {
    }

    private final UserRepository users;

    public MeController(UserRepository users) {
        this.users = users;
    }

    @Operation(summary = "The logged-in user",
            description = "payDay is null until onboarding. pendingPayDay is a scheduled pay day change.")
    @GetMapping("/api/me")
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        UUID id = UUID.fromString(jwt.getSubject());
        User user = users.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized"));
        return new MeResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getPayDay(),
                user.getPendingPayDay(), user.getPendingPayDayFrom());
    }
}
