package com.financetracker.cycle;

import java.time.LocalDate;

// needsPaise + wantsPaise + savingsPaise = salaryPaise + bonusPaise, split by the three percentages.
public record CycleView(
        LocalDate periodStart,
        LocalDate periodEnd,
        long salaryPaise,
        long needsPaise,
        long wantsPaise,
        long savingsPaise,
        // False until "Did your salary change?" is answered for this cycle.
        boolean salaryConfirmed,
        // Extra money this cycle only (0 if none).
        long bonusPaise,
        int needsPct,
        int wantsPct,
        int savingsPct) {

    public static CycleView from(Cycle cycle) {
        return new CycleView(
                cycle.getPeriodStart(),
                cycle.getPeriodEnd(),
                cycle.getSalaryPaise(),
                cycle.getNeedsPaise(),
                cycle.getWantsPaise(),
                cycle.getSavingsPaise(),
                cycle.isSalaryConfirmed(),
                cycle.getBonusPaise(),
                cycle.getNeedsPct(),
                cycle.getWantsPct(),
                cycle.getSavingsPct());
    }

    // Salary + bonus: what the cycle's budget is split from. Not a JSON field.
    public long incomePaise() {
        return salaryPaise + bonusPaise;
    }
}
