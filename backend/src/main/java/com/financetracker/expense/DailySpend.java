package com.financetracker.expense;

import java.time.LocalDate;

import com.financetracker.common.BudgetType;

// Total logged on one day for one type. Days with nothing logged have no row.
public record DailySpend(LocalDate date, BudgetType type, long spentPaise) {
}
