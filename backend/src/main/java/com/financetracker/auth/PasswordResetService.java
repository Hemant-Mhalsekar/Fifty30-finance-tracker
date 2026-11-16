package com.financetracker.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import com.financetracker.mail.Email;
import com.financetracker.mail.EmailSender;
import com.financetracker.user.User;
import com.financetracker.user.UserRepository;

@Service
public class PasswordResetService implements DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    static final Duration LINK_LIFETIME = Duration.ofMinutes(30);
    static final String INVALID_LINK = "This reset link is invalid or has expired. Request a new one.";

    // Background work so the request returns at the same speed whether or not the email has an
    // account; otherwise the response time would reveal which emails are registered.
    private final ExecutorService background = Executors.newVirtualThreadPerTaskExecutor();

    private final UserRepository users;
    private final PasswordResetTokenRepository resetTokens;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final EmailSender emailSender;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final String baseUrl;

    public PasswordResetService(
            UserRepository users,
            PasswordResetTokenRepository resetTokens,
            RefreshTokenRepository refreshTokens,
            PasswordEncoder passwordEncoder,
            EmailSender emailSender,
            TransactionTemplate transactions,
            Clock clock,
            @Value("${app.base-url}") String baseUrl) {
        this.users = users;
        this.resetTokens = resetTokens;
        this.refreshTokens = refreshTokens;
        this.passwordEncoder = passwordEncoder;
        this.emailSender = emailSender;
        this.transactions = transactions;
        this.clock = clock;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    /** Returns at once; the link is created and emailed in the background, only if the account exists. */
    public void requestReset(String normalizedEmail) {
        background.execute(() -> {
            try {
                sendResetLink(normalizedEmail);
            } catch (RuntimeException e) {
                // No email address or token in the log: just what kind of failure it was.
                log.warn("Password reset email failed: {}", e.getClass().getSimpleName());
            }
        });
    }

    private void sendResetLink(String normalizedEmail) {
        String rawToken = SecureTokens.generate();
        OffsetDateTime now = OffsetDateTime.now(clock);

        // The database work commits before the email goes out, so a slow provider holds no locks.
        Optional<UUID> userId = transactions.execute(status -> users.findByEmail(normalizedEmail).map(user -> {
            resetTokens.invalidateAllForUser(user.getId(), now);
            resetTokens.saveAndFlush(new PasswordResetToken(
                    user.getId(), SecureTokens.sha256Hex(rawToken), now.plus(LINK_LIFETIME)));
            return user.getId();
        }));
        if (userId == null || userId.isEmpty()) {
            return;
        }

        String link = baseUrl + "/reset-password?token=" + rawToken;
        emailSender.send(new Email(
                normalizedEmail,
                "Reset your Fifty30 password",
                "Someone (hopefully you) asked to reset the password for your Fifty30 account.\n\n"
                        + "Open this link to choose a new password. It works once and expires in 30 minutes:\n"
                        + link + "\n\n"
                        + "If you did not ask for this, ignore this email; your password stays the same.",
                "<p>Someone (hopefully you) asked to reset the password for your Fifty30 account.</p>"
                        + "<p><a href=\"" + link + "\">Choose a new password</a></p>"
                        + "<p>The link works once and expires in 30 minutes.</p>"
                        + "<p>If you did not ask for this, ignore this email; your password stays the same.</p>"));
    }

    /**
     * Sets a new password with a link from the email. The link is used up, every other link for the
     * account is cancelled, and every session is logged out in case someone else had access.
     */
    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        String hash = SecureTokens.sha256Hex(rawToken);
        OffsetDateTime now = OffsetDateTime.now(clock);
        if (resetTokens.consumeIfActive(hash, now) != 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_LINK);
        }

        UUID userId = resetTokens.findByTokenHash(hash).orElseThrow().getUserId();
        User user = users.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_LINK));
        user.changePasswordHash(passwordEncoder.encode(newPassword));
        users.saveAndFlush(user);

        resetTokens.invalidateAllForUser(userId, now);
        refreshTokens.revokeAllByUserId(userId);
    }

    // Used and expired links are useless after a day; the rows only take space.
    @Scheduled(initialDelay = 7, fixedDelay = 360, timeUnit = TimeUnit.MINUTES)
    public int deleteExpiredLinks() {
        Integer deleted = transactions.execute(
                status -> resetTokens.deleteExpiredBefore(OffsetDateTime.now(clock).minusDays(1)));
        return deleted == null ? 0 : deleted;
    }

    @Override
    public void destroy() {
        background.shutdown();
    }
}
