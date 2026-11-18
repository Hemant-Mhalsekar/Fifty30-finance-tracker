package com.financetracker.expense;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class ExpenseFilterTest {

    @Test
    void blankSearchMatchesEverything() {
        assertNull(ExpenseFilter.likePattern(null));
        assertNull(ExpenseFilter.likePattern("   "));
    }

    @Test
    void searchIsContainsIgnoringCaseWithWildcardsTakenLiterally() {
        assertEquals("%big basket%", ExpenseFilter.likePattern("  Big Basket "));
        assertEquals("%50!% off!_now!!%", ExpenseFilter.likePattern("50% off_now!"));
    }
}
