-- Whether the user has answered "Did your salary change?" for this cycle. Cycles that exist
-- already count as answered, so nobody is asked about a cycle that is half over. Cycles created
-- from now on by the roll-forward (which does not list this column) start unanswered; the
-- onboarding cycle is written as answered by the app, because the salary was just entered.
ALTER TABLE cycles ADD COLUMN salary_confirmed BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE cycles ALTER COLUMN salary_confirmed SET DEFAULT false;
