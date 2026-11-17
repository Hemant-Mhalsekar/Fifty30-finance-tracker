package com.financetracker.recurring;

import java.time.LocalDate;
import java.time.YearMonth;

// Due dates for "every month on day N". Days past the end of a month (29-31) fall on its last day,
// and each month is computed from N again, so a 31st that fell on 28 Feb is back on 31 Mar.
public final class MonthlySchedule {

    private MonthlySchedule() {
    }

    public static LocalDate occurrenceIn(YearMonth month, int dayOfMonth) {
        return month.atDay(Math.min(dayOfMonth, month.lengthOfMonth()));
    }

    // The first due date on or after the given date.
    public static LocalDate firstOnOrAfter(LocalDate date, int dayOfMonth) {
        YearMonth month = YearMonth.from(date);
        LocalDate occurrence = occurrenceIn(month, dayOfMonth);
        return occurrence.isBefore(date) ? occurrenceIn(month.plusMonths(1), dayOfMonth) : occurrence;
    }

    // The due date one month after the given one.
    public static LocalDate following(LocalDate dueDate, int dayOfMonth) {
        return occurrenceIn(YearMonth.from(dueDate).plusMonths(1), dayOfMonth);
    }
}
