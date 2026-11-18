package com.financetracker.expense;

import java.time.LocalDate;

// Everything matching the list's filters on one day, including expenses on other pages.
public record DayTotal(LocalDate date, long totalPaise) {
}
