package com.financetracker.expense;

import java.time.LocalDate;
import java.util.UUID;

import com.financetracker.common.BudgetType;

// Spending in one category (and logged type) within one cycle, identified by the cycle's start.
// Like CategorySpend, "Other" can appear once per type.
public record CycleCategorySpend(
        LocalDate periodStart,
        UUID categoryId,
        String name,
        boolean archived,
        BudgetType type,
        long spentPaise,
        long expenseCount) {
}
