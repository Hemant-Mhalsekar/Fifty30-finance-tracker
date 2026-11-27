-- A rotated refresh token may be presented once more within a short grace period, so a refresh
-- whose response was lost (mobile network drop) or two tabs refreshing at once do not end the session.
-- rotated_at is set only by rotation (not by logout or "revoke all"); grace_used allows it once.
ALTER TABLE refresh_tokens ADD COLUMN rotated_at TIMESTAMPTZ;
ALTER TABLE refresh_tokens ADD COLUMN grace_used BOOLEAN NOT NULL DEFAULT false;
