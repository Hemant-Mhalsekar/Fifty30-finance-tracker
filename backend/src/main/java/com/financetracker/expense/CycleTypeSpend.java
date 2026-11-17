package com.financetracker.expense;

import java.time.LocalDate;

import com.financetracker.common.BudgetType;

// Total logged in one cycle (identified by its start) for one type, and how many expenses that is.
public record CycleTypeSpend(LocalDate periodStart, BudgetType type, long spentPaise, long expenseCount) {
}
