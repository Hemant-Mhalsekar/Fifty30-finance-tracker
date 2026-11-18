-- Bonus for one pay cycle, divided by that cycle's split like the salary. Not copied to later cycles.
ALTER TABLE cycles ADD COLUMN bonus_paise BIGINT NOT NULL DEFAULT 0
    CHECK (bonus_paise BETWEEN 0 AND 1000000000);

-- The three allocations now add up to salary + bonus.
ALTER TABLE cycles DROP CONSTRAINT cycles_paise_total_check;
ALTER TABLE cycles ADD CONSTRAINT cycles_paise_total_check
    CHECK (needs_paise + wants_paise + savings_paise = salary_paise + bonus_paise);

-- Savings the user already had before using the app; null means none given. Only the starting point
-- of total savings, never part of a cycle's budget.
ALTER TABLE users ADD COLUMN opening_balance_paise BIGINT
    CHECK (opening_balance_paise IS NULL OR opening_balance_paise BETWEEN 0 AND 100000000000);
