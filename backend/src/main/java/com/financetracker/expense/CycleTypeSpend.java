package com.financetracker.expense;

import java.time.LocalDate;

import com.financetracker.common.BudgetType;

// Total logged in one cycle (identified by its start) for one type.
public record CycleTypeSpend(LocalDate periodStart, BudgetType type, long spentPaise) {
}
