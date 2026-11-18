-- Optional first name or nickname for the dashboard greeting ("Good evening, Asha").
ALTER TABLE users ADD COLUMN display_name TEXT
    CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 50);
