-- "Show my name in the greeting" in Settings. Off keeps the name saved but greets without it.
ALTER TABLE users ADD COLUMN show_name BOOLEAN NOT NULL DEFAULT TRUE;
