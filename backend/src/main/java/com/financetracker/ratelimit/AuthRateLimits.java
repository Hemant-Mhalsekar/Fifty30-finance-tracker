package com.financetracker.ratelimit;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;

// Slows down password guessing and mass sign-ups. Every attempt counts, successful or not.
@Component
public class AuthRateLimits {

    static final Duration LOGIN_WINDOW = Duration.ofMinutes(15);
    static final Duration REGISTER_WINDOW = Duration.ofHours(1);

    private final RateLimiter limiter;
    private final int loginPerIp;
    private final int loginPerEmail;
    private final int registerPerIp;
    private final int registerGlobal;
    private final int resetPerIp;
    private final int resetPerEmail;

    public AuthRateLimits(
            RateLimiter limiter,
            @Value("${app.rate-limit.login-per-ip}") int loginPerIp,
            @Value("${app.rate-limit.login-per-email}") int loginPerEmail,
            @Value("${app.rate-limit.register-per-ip}") int registerPerIp,
            @Value("${app.rate-limit.register-global}") int registerGlobal,
            @Value("${app.rate-limit.password-reset-per-ip}") int resetPerIp,
            @Value("${app.rate-limit.password-reset-per-email}") int resetPerEmail) {
        this.limiter = limiter;
        this.loginPerIp = loginPerIp;
        this.loginPerEmail = loginPerEmail;
        this.registerPerIp = registerPerIp;
        this.registerGlobal = registerGlobal;
        this.resetPerIp = resetPerIp;
        this.resetPerEmail = resetPerEmail;
    }

    // The per-email limit protects one account even when the attacker spreads guesses over
    // many IPs. Trade-off: someone can lock a known email out of login for up to 15 minutes.
    public void checkLogin(HttpServletRequest request, String normalizedEmail) {
        limiter.consume("login-ip", ClientIp.resolve(request), loginPerIp, LOGIN_WINDOW);
        limiter.consume("login-email", normalizedEmail, loginPerEmail, LOGIN_WINDOW);
    }

    // The global cap bounds sign-ups even if the IP is faked.
    public void checkRegister(HttpServletRequest request) {
        limiter.consume("register-ip", ClientIp.resolve(request), registerPerIp, REGISTER_WINDOW);
        limiter.consume("register-global", "all", registerGlobal, REGISTER_WINDOW);
    }

    // Each request can send an email, so this protects inboxes and the provider's daily quota.
    // The same limit applies whether or not the email has an account, so a 429 reveals nothing.
    public void checkPasswordReset(HttpServletRequest request, String normalizedEmail) {
        limiter.consume("reset-ip", ClientIp.resolve(request), resetPerIp, REGISTER_WINDOW);
        limiter.consume("reset-email", normalizedEmail, resetPerEmail, REGISTER_WINDOW);
    }
}
