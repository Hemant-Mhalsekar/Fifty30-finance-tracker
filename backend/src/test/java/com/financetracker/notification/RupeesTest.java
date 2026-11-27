package com.financetracker.notification;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class RupeesTest {

    @Test
    void indianGroupingAndPaiseOnlyWhenThereAreAny() {
        assertEquals("₹0", Rupees.format(0));
        assertEquals("₹5", Rupees.format(500));
        assertEquals("₹49.50", Rupees.format(4_950));
        assertEquals("₹0.05", Rupees.format(5));
        assertEquals("₹999", Rupees.format(99_900));
        assertEquals("₹1,000", Rupees.format(100_000));
        assertEquals("₹15,000", Rupees.format(1_500_000));
        assertEquals("₹1,50,000", Rupees.format(15_000_000));
        assertEquals("₹12,34,567.89", Rupees.format(123_456_789));
        assertEquals("₹1,00,00,000", Rupees.format(1_000_000_000));
        assertEquals("-₹1,200", Rupees.format(-120_000));
    }

    @Test
    void anExpenseCountsOnlyWhenItCrossesALine() {
        assertEquals(null, Reminders.crossed(7_000, 500, 10_000));
        assertEquals("near", Reminders.crossed(8_000, 500, 10_000));
        assertEquals(null, Reminders.crossed(8_700, 500, 10_000));
        assertEquals("reached", Reminders.crossed(10_000, 500, 10_000));
        assertEquals("reached", Reminders.crossed(10_500, 6_000, 10_000));
        assertEquals(null, Reminders.crossed(12_000, 500, 10_000));
    }
}
