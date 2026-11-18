package com.financetracker.user;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

// Cleans up the optional name shown in the greeting. Blank means "no name".
public final class DisplayNames {

    static final int MAX_LENGTH = 50;

    private DisplayNames() {
    }

    public static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        String name = raw.strip().replaceAll("\\s+", " ");
        if (name.isEmpty()) {
            return null;
        }
        if (name.codePointCount(0, name.length()) > MAX_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name must be at most 50 characters");
        }
        if (name.codePoints().anyMatch(Character::isISOControl)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name contains characters that are not allowed");
        }
        return name;
    }
}
