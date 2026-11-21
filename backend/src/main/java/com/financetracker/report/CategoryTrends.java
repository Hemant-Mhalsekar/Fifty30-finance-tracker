package com.financetracker.report;

import java.util.List;

import com.financetracker.cycle.CycleView;
import com.financetracker.expense.CycleCategorySpend;

// Raw material for the category trends report: the last cycles up to the current one (oldest
// first) and the spending per category in each. The client picks the top categories and the
// changes between cycles.
public record CategoryTrends(List<CycleView> cycles, List<CycleCategorySpend> rows) {
}
