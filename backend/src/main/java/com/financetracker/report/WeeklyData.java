package com.financetracker.report;

import java.time.LocalDate;
import java.util.List;

import com.financetracker.cycle.CycleView;
import com.financetracker.expense.DailySpend;

// Raw material for the weekly report: the days from..to (from is a Monday, to is today), the
// cycles overlapping them (each week's plan is prorated per day from its cycle's budget) and the
// daily totals. The client splits it into Monday-to-Sunday weeks.
public record WeeklyData(LocalDate from, LocalDate to, List<CycleView> cycles, List<DailySpend> daily) {
}
