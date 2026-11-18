package com.financetracker.expense;

import java.util.List;

// totalPaise covers every matching expense; dayTotals has one row for each date on this page.
public record ExpensePage(
        List<ExpenseView> items,
        int page,
        int size,
        long totalItems,
        int totalPages,
        long totalPaise,
        List<DayTotal> dayTotals) {
}
