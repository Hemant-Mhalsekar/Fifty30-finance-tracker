-- One-time password reset links. Only the SHA-256 hash of the token is stored, like refresh tokens.
-- used_at is set when the link is used or replaced by a newer one, so a link works at most once.
CREATE TABLE password_reset_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);

-- RLS is enabled (with no policies) so Supabase's automatic API cannot expose this table.
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
