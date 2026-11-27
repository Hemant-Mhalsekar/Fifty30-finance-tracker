package com.financetracker.recurring;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;

/**
 * When a recurring expense comes due. Only the fields of its frequency are set:
 * WEEKLY dayOfWeek (1 = Monday ... 7 = Sunday); MONTHLY dayOfMonth; YEARLY monthOfYear + dayOfMonth.
 * Days past the end of a month fall on its last day and are recomputed from the chosen day each
 * time, so a yearly 29 Feb is 28 Feb in other years and 29 Feb again in a leap year.
 */
public record Schedule(Frequency frequency, Integer dayOfMonth, Integer dayOfWeek, Integer monthOfYear) {

    public static Schedule weekly(int dayOfWeek) {
        return new Schedule(Frequency.WEEKLY, null, dayOfWeek, null);
    }

    public static Schedule monthly(int dayOfMonth) {
        return new Schedule(Frequency.MONTHLY, dayOfMonth, null, null);
    }

    public static Schedule yearly(int monthOfYear, int dayOfMonth) {
        return new Schedule(Frequency.YEARLY, dayOfMonth, null, monthOfYear);
    }

    /** The first due date on or after the given date. */
    public LocalDate firstOnOrAfter(LocalDate date) {
        return switch (frequency) {
            case WEEKLY -> date.with(TemporalAdjusters.nextOrSame(DayOfWeek.of(dayOfWeek)));
            case MONTHLY -> MonthlySchedule.firstOnOrAfter(date, dayOfMonth);
            case YEARLY -> {
                LocalDate occurrence = inYear(date.getYear());
                yield occurrence.isBefore(date) ? inYear(date.getYear() + 1) : occurrence;
            }
        };
    }

    /** The due date after the given one. */
    public LocalDate following(LocalDate dueDate) {
        return switch (frequency) {
            case WEEKLY -> dueDate.plusWeeks(1);
            case MONTHLY -> MonthlySchedule.following(dueDate, dayOfMonth);
            case YEARLY -> inYear(dueDate.getYear() + 1);
        };
    }

    /**
     * The occurrence in the same week (Monday to Sunday), month or year as the given date. Used when
     * the day changes, so a period already answered is not asked again and one waiting is not lost.
     */
    public LocalDate inSamePeriodAs(LocalDate date) {
        return switch (frequency) {
            case WEEKLY -> date.with(DayOfWeek.MONDAY).plusDays(dayOfWeek - 1L);
            case MONTHLY -> MonthlySchedule.occurrenceIn(YearMonth.from(date), dayOfMonth);
            case YEARLY -> inYear(date.getYear());
        };
    }

    private LocalDate inYear(int year) {
        return MonthlySchedule.occurrenceIn(Year.of(year).atMonth(monthOfYear), dayOfMonth);
    }
}
