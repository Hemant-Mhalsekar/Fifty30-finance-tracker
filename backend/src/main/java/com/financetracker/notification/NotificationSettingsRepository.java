package com.financetracker.notification;

import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

// Plain SQL: four booleans keyed by user need no entity.
@Repository
public class NotificationSettingsRepository {

    private final JdbcTemplate jdbc;

    public NotificationSettingsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<NotificationSettings> find(UUID userId) {
        return jdbc.query("""
                        select recurring_due, evening_reminder, budget_alerts, cycle_summary
                        from notification_settings where user_id = ?
                        """,
                (rs, row) -> new NotificationSettings(rs.getBoolean(1), rs.getBoolean(2), rs.getBoolean(3),
                        rs.getBoolean(4)),
                userId).stream().findFirst();
    }

    /** Saves all four in one statement; 0 when the account no longer exists. */
    public int save(UUID userId, NotificationSettings s) {
        return jdbc.update("""
                        insert into notification_settings
                            (user_id, recurring_due, evening_reminder, budget_alerts, cycle_summary)
                        select id, ?, ?, ?, ? from users where id = ?
                        on conflict (user_id) do update
                            set recurring_due = excluded.recurring_due,
                                evening_reminder = excluded.evening_reminder,
                                budget_alerts = excluded.budget_alerts,
                                cycle_summary = excluded.cycle_summary
                        """,
                s.recurringDue(), s.eveningReminder(), s.budgetAlerts(), s.cycleSummary(), userId);
    }
}
