package com.financetracker.cycle;

// The splits a user can choose; any other percentages are refused. BALANCED is the 50/30/20 rule.
public enum SplitPreset {
    BALANCED(50, 30, 20),
    HIGH_RENT(60, 20, 20),
    SAVER(50, 20, 30),
    LOW_COST(40, 30, 30);

    private final short needsPct;
    private final short wantsPct;
    private final short savingsPct;

    SplitPreset(int needsPct, int wantsPct, int savingsPct) {
        this.needsPct = (short) needsPct;
        this.wantsPct = (short) wantsPct;
        this.savingsPct = (short) savingsPct;
    }

    public short needsPct() {
        return needsPct;
    }

    public short wantsPct() {
        return wantsPct;
    }

    public short savingsPct() {
        return savingsPct;
    }

    public BudgetSplit split(long incomePaise) {
        return BudgetSplit.of(incomePaise, needsPct, wantsPct, savingsPct);
    }
}
