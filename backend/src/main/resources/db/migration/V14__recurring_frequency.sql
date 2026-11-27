-- Weekly (on a weekday, 1 = Monday ... 7 = Sunday, ISO) and yearly (on a date) next to monthly.
-- Existing rows stay monthly. Each frequency uses only its own fields; the rest stay NULL.
ALTER TABLE recurring_expenses
    ADD COLUMN frequency TEXT NOT NULL DEFAULT 'MONTHLY' CHECK (frequency IN ('WEEKLY', 'MONTHLY', 'YEARLY'));
ALTER TABLE recurring_expenses ADD COLUMN day_of_week SMALLINT CHECK (day_of_week BETWEEN 1 AND 7);
ALTER TABLE recurring_expenses ADD COLUMN month_of_year SMALLINT CHECK (month_of_year BETWEEN 1 AND 12);
ALTER TABLE recurring_expenses ALTER COLUMN day_of_month DROP NOT NULL;
ALTER TABLE recurring_expenses ADD CONSTRAINT recurring_expenses_schedule_check CHECK (
    (frequency = 'WEEKLY' AND day_of_week IS NOT NULL AND day_of_month IS NULL AND month_of_year IS NULL)
    OR (frequency = 'MONTHLY' AND day_of_month IS NOT NULL AND day_of_week IS NULL AND month_of_year IS NULL)
    OR (frequency = 'YEARLY' AND day_of_month IS NOT NULL AND month_of_year IS NOT NULL AND day_of_week IS NULL)
);
