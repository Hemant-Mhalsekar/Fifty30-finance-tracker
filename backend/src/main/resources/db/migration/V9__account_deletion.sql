-- Account deletion with a 7-day grace period: when set, the account and everything in it is
-- deleted at this time (by AccountDeletionJob) unless the user logs in before then.
ALTER TABLE users ADD COLUMN deletion_scheduled_at TIMESTAMPTZ;

CREATE INDEX users_deletion_scheduled_at_idx ON users (deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL;
