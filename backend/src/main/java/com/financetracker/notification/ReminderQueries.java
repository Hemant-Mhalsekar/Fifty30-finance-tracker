package com.financetracker.notification;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** The reads and the send log behind reminders. Plain SQL: small, set-based, easy to check. */
@Repository
public class ReminderQueries {

    public record DuePayment(String description, long amountPaise, LocalDate nextDueDate) {
    }

    public record Spending(long paise, int count) {
    }

    private final JdbcTemplate jdbc;

    public ReminderQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Set-up people with at least one device and this kind switched on (no settings row = on). */
    public List<UUID> recipients(NotificationKind kind) {
        return jdbc.queryForList("""
                select distinct s.user_id from push_subscriptions s
                join users u on u.id = s.user_id and u.pay_day is not null
                left join notification_settings n on n.user_id = s.user_id
                where coalesce(n.%s, true)
                """.formatted(kind.column), UUID.class);
    }

    public boolean wants(UUID userId, NotificationKind kind) {
        Boolean wants = jdbc.queryForObject("""
                select exists (
                    select 1 from push_subscriptions s
                    left join notification_settings n on n.user_id = s.user_id
                    where s.user_id = ? and coalesce(n.%s, true))
                """.formatted(kind.column), Boolean.class, userId);
        return Boolean.TRUE.equals(wants);
    }

    /** Payments waiting for an answer on that day, oldest first. */
    public List<DuePayment> duePayments(UUID userId, LocalDate today) {
        return jdbc.query("""
                select description, amount_paise, next_due_date from recurring_expenses
                where user_id = ? and not paused and next_due_date <= ?
                order by next_due_date, description
                """, (rs, row) -> new DuePayment(rs.getString(1), rs.getLong(2), rs.getObject(3, LocalDate.class)),
                userId, today);
    }

    /** Whether anything was logged (created, whatever its date) since the given moment. */
    public boolean loggedSince(UUID userId, OffsetDateTime since) {
        Boolean logged = jdbc.queryForObject(
                "select exists (select 1 from expenses where user_id = ? and created_at >= ?)", Boolean.class,
                userId, since);
        return Boolean.TRUE.equals(logged);
    }

    /** Needs and wants spent on dates from..to, and how many expenses. */
    public Spending needsAndWants(UUID userId, LocalDate from, LocalDate to) {
        return jdbc.queryForObject("""
                select coalesce(sum(amount_paise), 0), count(*) from expenses
                where user_id = ? and category_type in ('NEED', 'WANT') and expense_date between ? and ?
                """, (rs, row) -> new Spending(rs.getLong(1), rs.getInt(2)), userId, from, to);
    }

    /** Claims a send: true only for the first caller with this user, kind and period. */
    public boolean claim(UUID userId, String kind, String periodKey) {
        return jdbc.update("""
                insert into notification_log (user_id, kind, period_key) values (?, ?, ?)
                on conflict do nothing
                """, userId, kind, periodKey) == 1;
    }

    /** Gives a claim back when no device accepted the message, so a later run tries again. */
    public void release(UUID userId, String kind, String periodKey) {
        jdbc.update("delete from notification_log where user_id = ? and kind = ? and period_key = ?", userId, kind,
                periodKey);
    }

    public int forgetSentBefore(OffsetDateTime cutoff) {
        return jdbc.update("delete from notification_log where sent_at < ?", cutoff);
    }
}
