package com.financetracker.notification;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import com.financetracker.expense.ExpenseCreated;

/**
 * Runs the reminders. A fixed delay, not a cron time, because the free server sleeps when idle and
 * a missed cron minute would never come back; every run checks what is due and the send log stops
 * repeats. Budget alerts react to new expenses instead, off the request thread.
 */
@Component
public class ReminderJobs {

    private static final Logger log = LoggerFactory.getLogger(ReminderJobs.class);

    private final Reminders reminders;
    private final ReminderQueries queries;
    private final Clock clock;
    private final boolean scheduled;
    // Pushes can wait on a slow push service; the person saving an expense never should.
    private final ExecutorService background = Executors.newVirtualThreadPerTaskExecutor();

    public ReminderJobs(Reminders reminders, ReminderQueries queries, Clock clock,
            @Value("${app.reminders.scheduled:true}") boolean scheduled) {
        this.reminders = reminders;
        this.queries = queries;
        this.clock = clock;
        this.scheduled = scheduled;
    }

    @Scheduled(initialDelay = 2, fixedDelay = 10, timeUnit = TimeUnit.MINUTES)
    public void run() {
        if (!scheduled) {
            return;
        }
        try {
            int sent = reminders.runDue(ZonedDateTime.now(clock));
            // Old rows only matter for "already sent today / this cycle".
            queries.forgetSentBefore(OffsetDateTime.now(clock).minusDays(90));
            if (sent > 0) {
                log.info("Sent {} reminders", sent);
            }
        } catch (RuntimeException e) {
            log.warn("Reminder run failed: {}", e.getClass().getSimpleName());
        }
    }

    // After commit only: an expense that was rolled back must not trigger an alert.
    @TransactionalEventListener
    public void onExpenseCreated(ExpenseCreated expense) {
        background.execute(() -> {
            try {
                reminders.afterExpense(expense);
            } catch (RuntimeException e) {
                log.warn("Budget alert failed: {}", e.getClass().getSimpleName());
            }
        });
    }
}
