package com.financetracker.account;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Account")
@RestController
@RequestMapping("/api/account")
public class AccountController {

    // Never logged or echoed back.
    public record DeletionRequest(@NotBlank(message = "Password is required") String password) {
    }

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    // 202: accepted now, carried out when the grace period ends.
    @Operation(summary = "Schedule account deletion",
            description = "Needs the password. Ends every session; all data is deleted after 7 days"
                    + " unless you log in before then.")
    @PostMapping("/deletion")
    public ResponseEntity<AccountService.DeletionScheduled> requestDeletion(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody DeletionRequest body,
            HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(accountService.requestDeletion(UUID.fromString(jwt.getSubject()), body.password(), request));
    }
}
