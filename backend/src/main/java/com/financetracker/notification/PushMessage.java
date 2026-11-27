package com.financetracker.notification;

import java.util.regex.Pattern;

/**
 * One notification. The service worker shows title and body, opens url (an app path such as
 * "/recurring") when tapped, and replaces an earlier notification with the same tag instead of
 * stacking them. ttlSeconds is how long the push service keeps it for a phone that is offline.
 */
public record PushMessage(String title, String body, String url, String tag, int ttlSeconds, Urgency urgency) {

    public enum Urgency {
        LOW("low"), NORMAL("normal"), HIGH("high");

        private final String header;

        Urgency(String header) {
            this.header = header;
        }

        public String header() {
            return header;
        }
    }

    // RFC 8030 section 5.4: a Topic is up to 32 base64url characters.
    private static final Pattern TOPIC = Pattern.compile("[A-Za-z0-9_-]{1,32}");

    public PushMessage {
        if (title == null || title.isBlank() || title.length() > 100) {
            throw new IllegalArgumentException("Title must be 1 to 100 characters");
        }
        if (body == null || body.length() > 300) {
            throw new IllegalArgumentException("Body must be at most 300 characters");
        }
        if (url == null || !url.startsWith("/") || url.startsWith("//")) {
            throw new IllegalArgumentException("URL must be a path inside the app");
        }
        if (tag != null && !TOPIC.matcher(tag).matches()) {
            throw new IllegalArgumentException("Tag must be 1 to 32 letters, digits, - or _");
        }
        if (ttlSeconds < 0 || ttlSeconds > 7 * 24 * 60 * 60) {
            throw new IllegalArgumentException("TTL must be between 0 seconds and 7 days");
        }
        if (urgency == null) {
            throw new IllegalArgumentException("Urgency is required");
        }
    }
}
