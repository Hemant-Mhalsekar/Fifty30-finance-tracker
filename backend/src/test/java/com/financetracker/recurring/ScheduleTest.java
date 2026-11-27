package com.financetracker.recurring;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

class ScheduleTest {

    // 27 Nov 2026 is a Friday (5).
    private static final LocalDate FRIDAY = LocalDate.of(2026, 11, 27);

    @Test
    void weeklyComesDueOnItsWeekdayEveryWeek() {
        assertEquals(FRIDAY, Schedule.weekly(5).firstOnOrAfter(FRIDAY));
        assertEquals(LocalDate.of(2026, 11, 28), Schedule.weekly(6).firstOnOrAfter(FRIDAY));
        assertEquals(LocalDate.of(2026, 11, 30), Schedule.weekly(1).firstOnOrAfter(FRIDAY));
        assertEquals(LocalDate.of(2026, 12, 4), Schedule.weekly(5).following(FRIDAY));
        // Same Monday-to-Sunday week, even when the new day is earlier.
        assertEquals(LocalDate.of(2026, 11, 23), Schedule.weekly(1).inSamePeriodAs(FRIDAY));
        assertEquals(LocalDate.of(2026, 11, 29), Schedule.weekly(7).inSamePeriodAs(FRIDAY));
    }

    @Test
    void yearlyFallsOnItsDateAndTwentyNinthFebruaryOnTheLastDayOfFebruary() {
        Schedule diwaliBonus = Schedule.yearly(11, 27);
        assertEquals(FRIDAY, diwaliBonus.firstOnOrAfter(FRIDAY));
        assertEquals(LocalDate.of(2027, 11, 27), diwaliBonus.following(FRIDAY));
        assertEquals(LocalDate.of(2027, 3, 31), Schedule.yearly(3, 31).firstOnOrAfter(FRIDAY));
        assertEquals(LocalDate.of(2027, 1, 5), Schedule.yearly(1, 5).firstOnOrAfter(FRIDAY));

        Schedule leapDay = Schedule.yearly(2, 29);
        assertEquals(LocalDate.of(2027, 2, 28), leapDay.firstOnOrAfter(FRIDAY));
        assertEquals(LocalDate.of(2028, 2, 29), leapDay.following(LocalDate.of(2027, 2, 28)));
        assertEquals(LocalDate.of(2029, 2, 28), leapDay.following(LocalDate.of(2028, 2, 29)));
        assertEquals(LocalDate.of(2026, 2, 28), leapDay.inSamePeriodAs(FRIDAY));
    }

    @Test
    void monthlyKeepsTheMonthlyRules() {
        assertEquals(LocalDate.of(2026, 11, 30), Schedule.monthly(31).firstOnOrAfter(FRIDAY));
        assertEquals(LocalDate.of(2027, 2, 28), Schedule.monthly(31).following(LocalDate.of(2027, 1, 31)));
        assertEquals(LocalDate.of(2026, 11, 5), Schedule.monthly(5).inSamePeriodAs(FRIDAY));
    }
}
