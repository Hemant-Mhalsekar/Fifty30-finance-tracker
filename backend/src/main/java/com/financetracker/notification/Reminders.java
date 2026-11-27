package com.financetracker.notification;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.financetracker.common.BudgetType;
import com.financetracker.cycle.Cycle;
import com.financetracker.cycle.CycleRepository;
import com.financetracker.cycle.CycleService;
import com.financetracker.cycle.CycleView;
import com.financetracker.expense.ExpenseCreated;
import com.financetracker.report.CycleReport;
import com.financetracker.report.CycleReportService;

/**
 * What to tell whom, and when. Every send first claims a row in notification_log, so each
 * reminder goes out at most once however often this runs (the server may restart, or wake late).
 *
 * Times are windows, not exact minutes, because the free server only checks every few minutes:
 * a 09:00 reminder goes out at the first check after 09:00, any time until the window closes.
 * The keep-alive keeps the server awake from about 08:00 to 01:05 IST, which covers them all.
 */
@Service
public class Reminders {

    private static final Logger log = LoggerFactory.getLogger(Reminders.class);

    static final LocalTime MORNING = LocalTime.of(9, 0);
    static final LocalTime EVENING = LocalTime.of(21, 0);
    static final LocalTime SUNDAY_SUMMARY = LocalTime.of(19, 0);
    // Nothing is sent this late: a reminder at midnight is noise.
    static final LocalTime LAST_SEND = LocalTime.of(23, 30);

    private final ReminderQueries queries;
    private final NotificationService notifications;
    private final CycleRepository cycleRepository;
    private final CycleService cycleService;
    private final CycleReportService reportService;

    public Reminders(ReminderQueries queries, NotificationService notifications, CycleRepository cycleRepository,
            CycleService cycleService, CycleReportService reportService) {
        this.queries = queries;
        this.notifications = notifications;
        this.cycleRepository = cycleRepository;
        this.cycleService = cycleService;
        this.reportService = reportService;
    }

    /** One pass over every reminder that is due at this moment (India time). Returns how many went out. */
    public int runDue(ZonedDateTime now) {
        LocalTime time = now.toLocalTime();
        if (time.isAfter(LAST_SEND)) {
            return 0;
        }
        LocalDate today = now.toLocalDate();
        int sent = 0;
        if (!time.isBefore(MORNING)) {
            sent += forEach(NotificationKind.RECURRING_DUE, userId -> recurringDue(userId, today));
            sent += forEach(NotificationKind.CYCLE_SUMMARY, userId -> newCycle(userId, today));
        }
        if (now.getDayOfWeek() == DayOfWeek.SUNDAY && !time.isBefore(SUNDAY_SUMMARY)) {
            sent += forEach(NotificationKind.CYCLE_SUMMARY, userId -> weeklySummary(userId, today));
        }
        if (!time.isBefore(EVENING)) {
            OffsetDateTime startOfDay = today.atStartOfDay(now.getZone()).toOffsetDateTime();
            sent += forEach(NotificationKind.EVENING_REMINDER, userId -> eveningReminder(userId, today, startOfDay));
        }
        return sent;
    }

    // ---- the four kinds ----

    // Only when something comes due today: a payment left waiting is not nagged about every day.
    boolean recurringDue(UUID userId, LocalDate today) {
        List<ReminderQueries.DuePayment> waiting = queries.duePayments(userId, today);
        if (waiting.stream().noneMatch(p -> p.nextDueDate().equals(today))) {
            return false;
        }
        String title;
        String body;
        if (waiting.size() == 1) {
            ReminderQueries.DuePayment payment = waiting.getFirst();
            title = clip(payment.description(), 80) + " is due today";
            body = Rupees.format(payment.amountPaise()) + ". Tap to add it, change the amount or skip it.";
        } else {
            title = waiting.size() + " payments are due";
            body = names(waiting) + ". Tap to add or skip each one.";
        }
        return send(userId, "recurring-due", today.toString(),
                new PushMessage(title, body, "/recurring", "recurring-due", 6 * 3600, PushMessage.Urgency.HIGH));
    }

    // On the first day of a pay cycle, with its plan. Not for someone's very first cycle.
    boolean newCycle(UUID userId, LocalDate today) {
        Optional<Cycle> stored = cycleRepository.findContaining(userId, today);
        CycleView cycle = stored.map(CycleView::from).orElseGet(() -> cycleService.getCurrent(userId));
        if (!cycle.periodStart().equals(today) || cycleRepository.findContaining(userId, today.minusDays(1)).isEmpty()) {
            return false;
        }
        String body = Rupees.format(cycle.needsPaise()) + " for needs, " + Rupees.format(cycle.wantsPaise())
                + " for wants and " + Rupees.format(cycle.savingsPaise()) + " to save. Did your salary change?";
        return send(userId, "new-cycle", today.toString(),
                new PushMessage("A new pay cycle starts today", body, "/", "new-cycle", 12 * 3600,
                        PushMessage.Urgency.NORMAL));
    }

    // Sunday evening: the Monday-to-Sunday week that is ending.
    boolean weeklySummary(UUID userId, LocalDate sunday) {
        ReminderQueries.Spending week = queries.needsAndWants(userId, sunday.minusDays(6), sunday);
        String body;
        if (week.count() == 0) {
            body = "Nothing logged this week. A minute now keeps your budget right.";
        } else {
            CycleReport report = reportService.currentReport(userId);
            long left = report.needs().remainingPaise() + report.wants().remainingPaise();
            long days = report.days().remaining() + 1;
            body = Rupees.format(week.paise()) + " on needs and wants across " + week.count()
                    + (week.count() == 1 ? " expense. " : " expenses. ")
                    + (left >= 0 ? Rupees.format(left) + " left for " + days + (days == 1 ? " day" : " days")
                            + " of this cycle." : Rupees.format(-left) + " over plan this cycle.");
        }
        return send(userId, "weekly", sunday.toString(),
                new PushMessage("Your week", body, "/reports?view=trends&by=weeks", "weekly", 12 * 3600,
                        PushMessage.Urgency.LOW));
    }

    boolean eveningReminder(UUID userId, LocalDate today, OffsetDateTime startOfDay) {
        if (queries.loggedSince(userId, startOfDay)) {
            return false;
        }
        return send(userId, "evening", today.toString(),
                new PushMessage("Log today's spending?", "Nothing logged today yet. It takes a few seconds.", "/add",
                        "evening", 2 * 3600, PushMessage.Urgency.NORMAL));
    }

    /**
     * Right after an expense is stored: if it pushed needs or wants past 80% or 100% of this
     * cycle's plan, say so. Once per level per cycle, so deleting and re-adding sends nothing new.
     */
    public boolean afterExpense(ExpenseCreated expense) {
        if (expense.type() == BudgetType.INVESTMENT
                || !queries.wants(expense.userId(), NotificationKind.BUDGET_ALERTS)) {
            return false;
        }
        CycleReport report = reportService.currentReport(expense.userId());
        CycleView cycle = report.cycle();
        if (expense.expenseDate().isBefore(cycle.periodStart()) || expense.expenseDate().isAfter(cycle.periodEnd())) {
            return false;
        }
        boolean needs = expense.type() == BudgetType.NEED;
        CycleReport.Budget line = needs ? report.needs() : report.wants();
        String level = crossed(line.spentPaise(), expense.amountPaise(), line.allocatedPaise());
        if (level == null) {
            return false;
        }
        String name = needs ? "Needs" : "Wants";
        String bucket = needs ? "needs" : "wants";
        long days = report.days().remaining() + 1;
        String dayText = days + (days == 1 ? " day" : " days");
        String title;
        String body;
        if (line.spentPaise() > line.allocatedPaise()) {
            title = name + " are over plan";
            body = Rupees.format(line.spentPaise() - line.allocatedPaise()) + " more than planned, with " + dayText
                    + " to go. The extra comes out of savings.";
        } else if (level.equals("reached")) {
            title = "The " + bucket + " plan is used up";
            body = "Nothing left for " + bucket + " with " + dayText + " to go.";
        } else {
            title = name + " at " + (line.spentPaise() * 100 / line.allocatedPaise()) + "% of the plan";
            body = Rupees.format(line.allocatedPaise() - line.spentPaise()) + " left for " + dayText
                    + " in this cycle.";
        }
        String url = "/expenses?type=" + expense.type() + "&from=" + cycle.periodStart() + "&to=" + cycle.periodEnd();
        return send(expense.userId(), "budget-" + bucket + "-" + level, cycle.periodStart().toString(),
                new PushMessage(title, body, url, "budget-" + bucket, 12 * 3600, PushMessage.Urgency.HIGH));
    }

    /** "near" or "reached" when this expense moved spending across 80% or 100%; null otherwise. */
    static String crossed(long spentAfter, long amount, long allocated) {
        String after = level(spentAfter, allocated);
        return after != null && !after.equals(level(spentAfter - amount, allocated)) ? after : null;
    }

    private static String level(long spent, long allocated) {
        if (allocated <= 0) {
            return spent > 0 ? "reached" : null;
        }
        if (spent >= allocated) {
            return "reached";
        }
        return spent * 100 >= allocated * 80 ? "near" : null;
    }

    // ---- plumbing ----

    private interface PerUser {
        boolean run(UUID userId);
    }

    // One person's failure (a bad row, a deleted account) never stops the others.
    private int forEach(NotificationKind kind, PerUser action) {
        int sent = 0;
        for (UUID userId : queries.recipients(kind)) {
            try {
                if (action.run(userId)) {
                    sent++;
                }
            } catch (RuntimeException e) {
                log.warn("Reminder {} failed for one user: {}", kind, e.getClass().getSimpleName());
            }
        }
        return sent;
    }

    private boolean send(UUID userId, String kind, String periodKey, PushMessage message) {
        if (!queries.claim(userId, kind, periodKey)) {
            return false;
        }
        NotificationService.SendResult result = notifications.sendToUser(userId, message);
        if (result.delivered() == 0) {
            // Nobody got it (push service down, or no device left): let the next run try again.
            queries.release(userId, kind, periodKey);
            return false;
        }
        return true;
    }

    private static String names(List<ReminderQueries.DuePayment> payments) {
        List<String> names = payments.stream().map(p -> clip(p.description(), 30)).toList();
        if (names.size() <= 3) {
            return String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.getLast();
        }
        return String.join(", ", names.subList(0, 3)) + " and " + (names.size() - 3) + " more";
    }

    private static String clip(String text, int max) {
        return text.length() <= max ? text : text.substring(0, max - 1) + "…";
    }
}
