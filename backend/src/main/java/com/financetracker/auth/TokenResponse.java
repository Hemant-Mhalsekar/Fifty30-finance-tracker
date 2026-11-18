package com.financetracker.auth;

// accountRestored: this login cancelled a scheduled account deletion, so the app can say so.
public record TokenResponse(String accessToken, boolean accountRestored) {

    public TokenResponse(String accessToken) {
        this(accessToken, false);
    }
}
