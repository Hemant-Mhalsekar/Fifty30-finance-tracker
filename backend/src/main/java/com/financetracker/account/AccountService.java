package com.financetracker.account;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.financetracker.auth.RefreshTokenRepository;
import com.financetracker.ratelimit.AuthRateLimits;
import com.financetracker.user.User;
import com.financetracker.user.UserRepository;

import jakarta.servlet.http.HttpServletRequest;

@Service
public class AccountService {

    // Long enough to change your mind, short enough that "delete" means it.
    public static final Duration GRACE_PERIOD = Duration.ofDays(7);

    public record DeletionScheduled(OffsetDateTime deleteAfter) {
    }

    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final AuthRateLimits rateLimits;
    private final Clock clock;

    public AccountService(
            UserRepository users,
            RefreshTokenRepository refreshTokens,
            PasswordEncoder passwordEncoder,
            AuthRateLimits rateLimits,
            Clock clock) {
        this.users = users;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.rateLimits = rateLimits;
        this.clock = clock;
    }

    // The password proves it is the owner, not someone holding an unlocked, signed-in phone.
    // Every session ends at once; the data stays for the grace period, and logging in before
    // it ends keeps the account (see AuthController.login).
    @Transactional
    public DeletionScheduled requestDeletion(UUID userId, String password, HttpServletRequest request) {
        User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized"));
        // Same limits as login, so this cannot be used to guess the password.
        rateLimits.checkLogin(request, user.getEmail());
        if (password == null || !passwordEncoder.matches(password, user.getPasswordHash())) {
            // 400, not 401: a 401 would make the app treat the session as ended.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password is incorrect");
        }

        OffsetDateTime deleteAfter = OffsetDateTime.now(clock).plus(GRACE_PERIOD).truncatedTo(ChronoUnit.SECONDS);
        user.scheduleDeletion(deleteAfter);
        users.saveAndFlush(user);
        refreshTokens.revokeAllByUserId(userId);
        return new DeletionScheduled(deleteAfter);
    }
}
