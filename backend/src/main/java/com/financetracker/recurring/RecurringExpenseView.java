package com.financetracker.recurring;

import java.time.LocalDate;
import java.util.UUID;

import com.financetracker.common.BudgetType;

// due: not paused and the next due date is today or earlier, so it is waiting for Confirm or Skip.
public record RecurringExpenseView(
        UUID id,
        UUID categoryId,
        BudgetType type,
        long amountPaise,
        String description,
        int dayOfMonth,
        LocalDate nextDueDate,
        boolean paused,
        boolean due) {

    public static RecurringExpenseView from(RecurringExpense r, LocalDate today) {
        return new RecurringExpenseView(
                r.getId(),
                r.getCategoryId(),
                r.getType(),
                r.getAmountPaise(),
                r.getDescription(),
                r.getDayOfMonth(),
                r.getNextDueDate(),
                r.isPaused(),
                !r.isPaused() && !r.getNextDueDate().isAfter(today));
    }
}
