-- Password reset links.
--
-- The token in the emailed link is a credential — whoever holds it can set the
-- account's password — so only its hash is stored, like every other secret.
-- A link works once (used_at) and for a short time (expires_at). Asking again
-- replaces any earlier link for the same person.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash  text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id);
