package com.financetracker.ratelimit;

import jakarta.servlet.http.HttpServletRequest;

public final class ClientIp {

    // Longest textual IPv6 address (with an embedded IPv4 part).
    private static final int MAX_LENGTH = 45;

    private ClientIp() {
    }

    // Requests arrive browser -> Vercel -> Render's proxy -> app, so getRemoteAddr() is Render's
    // proxy for every user. Vercel overwrites X-Forwarded-For with the real client IP and
    // Render appends hops after it, so the first entry is the client.
    // Weakness: a request sent straight to the onrender.com URL can put any value first. The
    // per-email login limit and the global register limit do not depend on the IP for that reason.
    public static String resolve(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null) {
            int comma = forwarded.indexOf(',');
            String first = (comma >= 0 ? forwarded.substring(0, comma) : forwarded).trim();
            if (!first.isEmpty() && first.length() <= MAX_LENGTH) {
                return first;
            }
        }
        return request.getRemoteAddr();
    }
}
