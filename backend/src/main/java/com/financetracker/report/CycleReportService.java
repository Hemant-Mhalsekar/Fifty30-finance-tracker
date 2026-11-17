package com.financetracker.report;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.financetracker.common.BudgetType;
import com.financetracker.cycle.Cycle;
import com.financetracker.cycle.CycleRepository;
import com.financetracker.cycle.CycleService;
import com.financetracker.cycle.CycleView;
import com.financetracker.expense.CategorySpend;
import com.financetracker.expense.CycleTypeSpend;
import com.financetracker.expense.ExpenseRepository;

@Service
public class CycleReportService {

    // The history chart shows 6 cycles; 12 (a year) is the most one request may ask for.
    public static final int MAX_HISTORY = 12;

    private final CycleService cycleService;
    private final CycleRepository cycleRepository;
    private final ExpenseRepository expenseRepository;
    private final Clock clock;

    public CycleReportService(
            CycleService cycleService,
            CycleRepository cycleRepository,
            ExpenseRepository expenseRepository,
            Clock clock) {
        this.cycleService = cycleService;
        this.cycleRepository = cycleRepository;
        this.expenseRepository = expenseRepository;
        this.clock = clock;
    }

    // Read-write, not readOnly: getting the current cycle can create missing cycles.
    @Transactional
    public CycleReport currentReport(UUID userId) {
        return build(userId, cycleService.getCurrent(userId));
    }

    @Transactional
    public CycleReport reportForDate(UUID userId, LocalDate date) {
        // Rolls forward first so a date in a not-yet-created recent cycle is found,
        // and so a user who has not onboarded gets the same 409 as everywhere else.
        cycleService.getCurrent(userId);
        CycleView cycle = cycleRepository.findContaining(userId, date)
                .map(CycleView::from)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No cycle contains that date"));
        return build(userId, cycle);
    }

    private CycleReport build(UUID userId, CycleView cycle) {
        LocalDate today = LocalDate.now(clock);
        List<CategorySpend> categories =
                expenseRepository.sumByCategory(userId, cycle.periodStart(), cycle.periodEnd());

        long needsSpent = 0;
        long wantsSpent = 0;
        long invested = 0;
        long expenseCount = 0;
        for (CategorySpend row : categories) {
            switch (row.type()) {
                case NEED -> needsSpent += row.spentPaise();
                case WANT -> wantsSpent += row.spentPaise();
                case INVESTMENT -> invested += row.spentPaise();
            }
            expenseCount += row.expenseCount();
        }

        long saved = cycle.salaryPaise() - needsSpent - wantsSpent;
        long totalLogged = needsSpent + wantsSpent + invested;

        Optional<LocalDate> lastLoggedOn = expenseRepository.findLastCreatedAt(userId)
                .map(createdAt -> toLocalDate(createdAt));

        return new CycleReport(
                cycle,
                days(cycle, today),
                budget(cycle.needsPaise(), needsSpent),
                budget(cycle.wantsPaise(), wantsSpent),
                new CycleReport.Savings(cycle.savingsPaise(), saved, invested, saved < 0),
                totalLogged,
                totalLogged > cycle.salaryPaise(),
                expenseCount,
                categories,
                lastLoggedOn.orElse(null),
                lastLoggedOn.map(date -> ChronoUnit.DAYS.between(date, today)).orElse(null),
                expenseRepository.sumByDay(userId, cycle.periodStart(), cycle.periodEnd()));
    }

    // The cycle containing the date (today if none is given) and up to count - 1 cycles before it,
    // oldest first. Rolls forward first, like the reports.
    @Transactional
    public List<CycleHistoryItem> history(UUID userId, LocalDate date, int count) {
        if (count < 1 || count > MAX_HISTORY) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Count must be between 1 and " + MAX_HISTORY);
        }
        cycleService.getCurrent(userId);
        LocalDate anchorDate = date != null ? date : LocalDate.now(clock);
        Cycle anchor = cycleRepository.findContaining(userId, anchorDate)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No cycle contains that date"));

        List<Cycle> cycles = new ArrayList<>(cycleRepository.findByUserIdAndPeriodStartLessThanEqualOrderByPeriodStartDesc(
                userId, anchor.getPeriodStart(), Limit.of(count)));
        Collections.reverse(cycles);

        Map<LocalDate, long[]> totals = new HashMap<>();
        for (CycleTypeSpend row : expenseRepository.sumByCycle(
                userId, cycles.getFirst().getPeriodStart(), anchor.getPeriodStart())) {
            long[] t = totals.computeIfAbsent(row.periodStart(), k -> new long[3]);
            t[row.type().ordinal()] += row.spentPaise();
        }

        List<CycleHistoryItem> items = new ArrayList<>(cycles.size());
        for (Cycle cycle : cycles) {
            long[] t = totals.getOrDefault(cycle.getPeriodStart(), new long[3]);
            long needs = t[BudgetType.NEED.ordinal()];
            long wants = t[BudgetType.WANT.ordinal()];
            long invested = t[BudgetType.INVESTMENT.ordinal()];
            items.add(new CycleHistoryItem(
                    CycleView.from(cycle), needs, wants, invested, cycle.getSalaryPaise() - needs - wants));
        }
        return items;
    }

    private LocalDate toLocalDate(OffsetDateTime instant) {
        return instant.atZoneSameInstant(clock.getZone()).toLocalDate();
    }

    private static CycleReport.Budget budget(long allocated, long spent) {
        return new CycleReport.Budget(allocated, spent, allocated - spent, spent > allocated);
    }

    private static CycleReport.Days days(CycleView cycle, LocalDate today) {
        long total = ChronoUnit.DAYS.between(cycle.periodStart(), cycle.periodEnd()) + 1;
        if (today.isAfter(cycle.periodEnd())) {
            return new CycleReport.Days(total, total, 0);
        }
        long elapsed = ChronoUnit.DAYS.between(cycle.periodStart(), today) + 1;
        return new CycleReport.Days(total, elapsed, total - elapsed);
    }
}
