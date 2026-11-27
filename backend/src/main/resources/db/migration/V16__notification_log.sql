-- One row per notification already sent, so a restart, a redeploy or two overlapping runs never
-- send the same reminder twice: the sender inserts the row first and only sends if it was new.
-- kind is the reminder type (e.g. evening, budget-need-near); period_key what it was for
-- (a date, or the start of a pay cycle).
CREATE TABLE notification_log (
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind       TEXT        NOT NULL CHECK (length(kind) BETWEEN 1 AND 40),
    period_key TEXT        NOT NULL CHECK (length(period_key) BETWEEN 1 AND 40),
    sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, kind, period_key)
);

CREATE INDEX notification_log_sent_at_idx ON notification_log (sent_at);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
