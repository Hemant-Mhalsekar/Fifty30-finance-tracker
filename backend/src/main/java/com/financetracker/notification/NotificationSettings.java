package com.financetracker.notification;

/** Which notifications a person wants, on every device they turned notifications on. */
public record NotificationSettings(boolean recurringDue, boolean eveningReminder, boolean budgetAlerts,
        boolean cycleSummary) {

    /** No saved row means everything is on: turning notifications on is the opt-in. */
    public static final NotificationSettings ALL_ON = new NotificationSettings(true, true, true, true);
}
