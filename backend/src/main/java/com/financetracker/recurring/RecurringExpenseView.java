package com.financetracker.recurring;

import java.time.LocalDate;
import java.util.UUID;

import com.financetracker.common.BudgetType;

// Only the fields of the frequency are set (see Schedule), the others are null.
// due: not paused and the next due date is today or earlier, so it is waiting for Confirm or Skip.
public record RecurringExpenseView(
        UUID id,
        UUID categoryId,
        BudgetType type,
        long amountPaise,
        String description,
        Frequency frequency,
        Integer dayOfMonth,
        Integer dayOfWeek,
        Integer monthOfYear,
        LocalDate nextDueDate,
        boolean paused,
        boolean due) {

    public static RecurringExpenseView from(RecurringExpense r, LocalDate today) {
        Schedule schedule = r.getSchedule();
        return new RecurringExpenseView(
                r.getId(),
                r.getCategoryId(),
                r.getType(),
                r.getAmountPaise(),
                r.getDescription(),
                schedule.frequency(),
                schedule.dayOfMonth(),
                schedule.dayOfWeek(),
                schedule.monthOfYear(),
                r.getNextDueDate(),
                r.isPaused(),
                !r.isPaused() && !r.getNextDueDate().isAfter(today));
    }
}
