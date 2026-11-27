package com.financetracker.report;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
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
    // About six months of weeks.
    public static final int MAX_WEEKS = 26;
    // Dates before 2000 are refused for expenses, so no cycle can start earlier.
    public static final int MIN_YEAR = 2000;
    public static final int MAX_YEAR = 9999;

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

        // Salary + bonus: unspent money counts as saved.
        long saved = cycle.incomePaise() - needsSpent - wantsSpent;
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
                totalLogged > cycle.incomePaise(),
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
        return summarize(userId, cycles);
    }

    // Every stored cycle, oldest first, with its totals: the yearly and savings reports.
    @Transactional
    public List<CycleHistoryItem> allCycles(UUID userId) {
        cycleService.getCurrent(userId);
        List<Cycle> cycles = new ArrayList<>(cycleRepository.findAllByUserIdOrderByPeriodStartDesc(userId));
        Collections.reverse(cycles);
        return summarize(userId, cycles);
    }

    // The cycles that start in a calendar year (oldest first) and the spending per category in each,
    // for the year in review. Same rows as the category trends, so the client sums them the same way.
    @Transactional
    public CategoryTrends year(UUID userId, int year) {
        if (year < MIN_YEAR || year > MAX_YEAR) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Year must be between " + MIN_YEAR + " and " + MAX_YEAR);
        }
        cycleService.getCurrent(userId);
        LocalDate first = LocalDate.of(year, 1, 1);
        LocalDate last = LocalDate.of(year, 12, 31);
        List<Cycle> cycles = new ArrayList<>(cycleRepository.findAllByUserIdOrderByPeriodStartDesc(userId).stream()
                .filter(c -> !c.getPeriodStart().isBefore(first) && !c.getPeriodStart().isAfter(last))
                .toList());
        Collections.reverse(cycles);
        return new CategoryTrends(
                cycles.stream().map(CycleView::from).toList(),
                cycles.isEmpty() ? List.of() : expenseRepository.sumByCycleAndCategory(userId, first, last));
    }

    // Spending per category in the last `count` cycles up to the current one, oldest first.
    @Transactional
    public CategoryTrends categoryTrends(UUID userId, int count) {
        if (count < 1 || count > MAX_HISTORY) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Count must be between 1 and " + MAX_HISTORY);
        }
        CycleView current = cycleService.getCurrent(userId);
        List<Cycle> cycles = new ArrayList<>(cycleRepository.findByUserIdAndPeriodStartLessThanEqualOrderByPeriodStartDesc(
                userId, current.periodStart(), Limit.of(count)));
        Collections.reverse(cycles);
        return new CategoryTrends(
                cycles.stream().map(CycleView::from).toList(),
                expenseRepository.sumByCycleAndCategory(
                        userId, cycles.getFirst().getPeriodStart(), cycles.getLast().getPeriodStart()));
    }

    // The last `weeks` Monday-to-Sunday weeks up to today (the current week is partial).
    @Transactional
    public WeeklyData weekly(UUID userId, int weeks) {
        if (weeks < 1 || weeks > MAX_WEEKS) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Weeks must be between 1 and " + MAX_WEEKS);
        }
        cycleService.getCurrent(userId);
        LocalDate today = LocalDate.now(clock);
        LocalDate from = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(weeks - 1L);
        List<CycleView> cycles = cycleRepository.findOverlapping(userId, from, today).stream()
                .map(CycleView::from)
                .toList();
        return new WeeklyData(from, today, cycles, expenseRepository.sumByDay(userId, from, today));
    }

    // Totals per cycle from one GROUP BY query; cycles must be oldest first and not empty.
    private List<CycleHistoryItem> summarize(UUID userId, List<Cycle> cycles) {
        Map<LocalDate, long[]> totals = new HashMap<>();
        for (CycleTypeSpend row : expenseRepository.sumByCycle(
                userId, cycles.getFirst().getPeriodStart(), cycles.getLast().getPeriodStart())) {
            // Index 0-2: paise per type in BudgetType order; index 3: number of expenses.
            long[] t = totals.computeIfAbsent(row.periodStart(), k -> new long[4]);
            t[row.type().ordinal()] += row.spentPaise();
            t[3] += row.expenseCount();
        }

        List<CycleHistoryItem> items = new ArrayList<>(cycles.size());
        for (Cycle cycle : cycles) {
            long[] t = totals.getOrDefault(cycle.getPeriodStart(), new long[4]);
            long needs = t[BudgetType.NEED.ordinal()];
            long wants = t[BudgetType.WANT.ordinal()];
            long invested = t[BudgetType.INVESTMENT.ordinal()];
            items.add(new CycleHistoryItem(
                    CycleView.from(cycle), needs, wants, invested, cycle.getIncomePaise() - needs - wants, t[3]));
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
