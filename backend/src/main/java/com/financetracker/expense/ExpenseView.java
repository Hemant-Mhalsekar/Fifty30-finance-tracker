package com.financetracker.expense;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import com.financetracker.common.BudgetType;

// createdAt is when the expense was logged (not when the money was spent).
public record ExpenseView(
        UUID id,
        UUID categoryId,
        BudgetType type,
        long amountPaise,
        LocalDate expenseDate,
        String description,
        OffsetDateTime createdAt) {

    public static ExpenseView from(Expense expense) {
        return new ExpenseView(
                expense.getId(),
                expense.getCategoryId(),
                expense.getCategoryType(),
                expense.getAmountPaise(),
                expense.getExpenseDate(),
                expense.getDescription(),
                expense.getCreatedAt());
    }
}
