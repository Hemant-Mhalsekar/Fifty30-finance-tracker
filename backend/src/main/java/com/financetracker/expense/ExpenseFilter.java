package com.financetracker.expense;

import java.time.LocalDate;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.financetracker.common.BudgetType;

// The filters shared by the expense list, its totals and the CSV export. Null parts match everything.
// descriptionPattern is a lower-case LIKE pattern with % and _ escaped, or null.
record ExpenseFilter(
        UUID userId,
        LocalDate from,
        LocalDate to,
        UUID categoryId,
        BudgetType type,
        String descriptionPattern) {

    static final int MAX_QUERY_LENGTH = 100;
    private static final LocalDate DEFAULT_FROM_DATE = LocalDate.of(1900, 1, 1);
    private static final LocalDate DEFAULT_TO_DATE = LocalDate.of(9999, 12, 31);

    static ExpenseFilter of(UUID userId, LocalDate from, LocalDate to, UUID categoryId, BudgetType type,
            String query) {
        LocalDate effectiveFrom = from != null ? from : DEFAULT_FROM_DATE;
        LocalDate effectiveTo = to != null ? to : DEFAULT_TO_DATE;
        if (effectiveFrom.isAfter(effectiveTo)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "From date must not be after to date");
        }
        return new ExpenseFilter(userId, effectiveFrom, effectiveTo, categoryId, type, likePattern(query));
    }

    // "Contains, ignoring case". The user's % and _ are matched literally ('!' is the LIKE escape
    // character; a backslash would clash with escapes in HQL string literals).
    static String likePattern(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        String text = query.strip();
        if (text.length() > MAX_QUERY_LENGTH) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Search must be at most 100 characters");
        }
        String escaped = text.toLowerCase(Locale.ROOT)
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
        return "%" + escaped + "%";
    }
}
