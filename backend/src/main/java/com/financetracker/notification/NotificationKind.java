package com.financetracker.notification;

/** The four kinds a person can switch on or off, with the settings column behind each. */
public enum NotificationKind {
    RECURRING_DUE("recurring_due"),
    EVENING_REMINDER("evening_reminder"),
    BUDGET_ALERTS("budget_alerts"),
    CYCLE_SUMMARY("cycle_summary");

    // A fixed column name, never user input, so it is safe to put into SQL.
    final String column;

    NotificationKind(String column) {
        this.column = column;
    }
}
