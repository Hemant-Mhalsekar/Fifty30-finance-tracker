package com.financetracker.report;

import com.financetracker.cycle.CycleView;

// One past or current cycle in the history chart. Same rules as the cycle report: savedPaise is
// salary - needs spent - wants spent (negative = deficit), investedPaise is part of savings.
public record CycleHistoryItem(
        CycleView cycle,
        long needsSpentPaise,
        long wantsSpentPaise,
        long investedPaise,
        long savedPaise) {
}
