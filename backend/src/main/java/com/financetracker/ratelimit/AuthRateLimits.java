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

    public AuthRateLimits(
            RateLimiter limiter,
            @Value("${app.rate-limit.login-per-ip}") int loginPerIp,
            @Value("${app.rate-limit.login-per-email}") int loginPerEmail,
            @Value("${app.rate-limit.register-per-ip}") int registerPerIp,
            @Value("${app.rate-limit.register-global}") int registerGlobal) {
        this.limiter = limiter;
        this.loginPerIp = loginPerIp;
        this.loginPerEmail = loginPerEmail;
        this.registerPerIp = registerPerIp;
        this.registerGlobal = registerGlobal;
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
}
