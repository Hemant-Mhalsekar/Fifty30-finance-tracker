-- An id the phone gives an expense it saved while offline, so sending it again (a lost response,
-- a retry after reconnecting) returns the expense already stored instead of adding it twice.
-- Unique per user only when present; expenses added online may leave it empty.
ALTER TABLE expenses ADD COLUMN client_id UUID;

CREATE UNIQUE INDEX expenses_user_client_id_idx ON expenses (user_id, client_id) WHERE client_id IS NOT NULL;
