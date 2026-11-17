package com.financetracker.recurring;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;
import java.time.YearMonth;

import org.junit.jupiter.api.Test;

class MonthlyScheduleTest {

    @Test
    void daysPastTheEndOfAMonthFallOnItsLastDay() {
        assertEquals(LocalDate.of(2026, 2, 28), MonthlySchedule.occurrenceIn(YearMonth.of(2026, 2), 31));
        assertEquals(LocalDate.of(2028, 2, 29), MonthlySchedule.occurrenceIn(YearMonth.of(2028, 2), 30));
        assertEquals(LocalDate.of(2026, 4, 30), MonthlySchedule.occurrenceIn(YearMonth.of(2026, 4), 31));
        assertEquals(LocalDate.of(2026, 4, 5), MonthlySchedule.occurrenceIn(YearMonth.of(2026, 4), 5));
    }

    @Test
    void firstOnOrAfterIncludesTheSameDayAndOtherwiseMovesToNextMonth() {
        assertEquals(LocalDate.of(2026, 11, 17), MonthlySchedule.firstOnOrAfter(LocalDate.of(2026, 11, 17), 17));
        assertEquals(LocalDate.of(2026, 11, 20), MonthlySchedule.firstOnOrAfter(LocalDate.of(2026, 11, 17), 20));
        assertEquals(LocalDate.of(2026, 12, 5), MonthlySchedule.firstOnOrAfter(LocalDate.of(2026, 11, 17), 5));
        assertEquals(LocalDate.of(2027, 1, 5), MonthlySchedule.firstOnOrAfter(LocalDate.of(2026, 12, 31), 5));
        assertEquals(LocalDate.of(2026, 11, 30), MonthlySchedule.firstOnOrAfter(LocalDate.of(2026, 11, 17), 31));
    }

    @Test
    void followingGoesBackToTheChosenDayAfterAShortMonth() {
        assertEquals(LocalDate.of(2026, 2, 28), MonthlySchedule.following(LocalDate.of(2026, 1, 31), 31));
        assertEquals(LocalDate.of(2026, 3, 31), MonthlySchedule.following(LocalDate.of(2026, 2, 28), 31));
        assertEquals(LocalDate.of(2027, 1, 1), MonthlySchedule.following(LocalDate.of(2026, 12, 1), 1));
    }
}
