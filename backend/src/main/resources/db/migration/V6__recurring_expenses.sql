-- A monthly expense (rent, SIP, EMI, subscription) that the user confirms each time it comes due.
-- Nothing is written to expenses until the user confirms or skips; next_due_date is the
-- occurrence that is waiting (or will be waiting) for an answer.
CREATE TABLE recurring_expenses (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    category_id   UUID        NOT NULL,
    -- Only set for categories without a fixed type (Other). For every other category the
    -- category's type at confirm time is used, the same as when an expense is logged by hand.
    type          TEXT        CHECK (type IS NULL OR type IN ('NEED', 'WANT', 'INVESTMENT')),
    amount_paise  BIGINT      NOT NULL CHECK (amount_paise BETWEEN 1 AND 10000000000),
    description   TEXT        NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 200),
    -- 29, 30 and 31 fall on the last day of shorter months.
    day_of_month  SMALLINT    NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    next_due_date DATE        NOT NULL,
    paused        BOOLEAN     NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Same composite key and NO ACTION rule as expenses: a category in use cannot be deleted,
    -- and deleting a user still cascades cleanly.
    CONSTRAINT recurring_expenses_category_same_user_fk
        FOREIGN KEY (category_id, user_id) REFERENCES categories (id, user_id)
);

CREATE INDEX recurring_expenses_user_id_idx ON recurring_expenses (user_id);
CREATE INDEX recurring_expenses_category_id_idx ON recurring_expenses (category_id);

-- RLS with no policies, like every other table, so Supabase's automatic API cannot expose it.
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
