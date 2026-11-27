package com.financetracker.expense;

import java.time.LocalDate;
import java.util.UUID;

import com.financetracker.common.BudgetType;

/** Published when a new expense is stored (not when a retry returns one already stored). */
public record ExpenseCreated(UUID userId, BudgetType type, long amountPaise, LocalDate expenseDate) {
}
