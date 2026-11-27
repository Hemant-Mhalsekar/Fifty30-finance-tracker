-- Web Push: one row per browser that turned notifications on. The endpoint is the push
-- service URL for that browser and is unique: a shared phone moves to whoever subscribed last.
-- p256dh and auth are the browser's public key and secret for encrypting messages (base64url).
CREATE TABLE push_subscriptions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    endpoint      TEXT        NOT NULL UNIQUE CHECK (length(endpoint) BETWEEN 1 AND 2048),
    p256dh        TEXT        NOT NULL CHECK (length(p256dh) BETWEEN 1 AND 128),
    auth          TEXT        NOT NULL CHECK (length(auth) BETWEEN 1 AND 64),
    subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions (user_id);

-- Which notifications a person wants, on every device. No row = all on.
CREATE TABLE notification_settings (
    user_id          UUID    PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    recurring_due    BOOLEAN NOT NULL DEFAULT true,
    evening_reminder BOOLEAN NOT NULL DEFAULT true,
    budget_alerts    BOOLEAN NOT NULL DEFAULT true,
    cycle_summary    BOOLEAN NOT NULL DEFAULT true
);

-- RLS with no policies, like every other table, so Supabase's automatic API cannot expose them.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
