-- Two-factor sign-in (authenticator-app codes, RFC 6238).
--
-- A row exists only once the person has proved their device works, so there is
-- no half-enrolled state to reason about: a secret that is still being set up
-- lives briefly in Redis, not here.
--
-- The secret has to be read back to check every code, so it is encrypted (not
-- hashed), like outgoing OAuth credentials. `last_step` is the newest 30-second
-- step already accepted: a code can be used once, so one that was watched over a
-- shoulder or phished cannot be replayed inside its validity window.
--
-- Recovery codes are random, single-use and only ever stored as a hash.

CREATE TABLE IF NOT EXISTS user_totp (
  user_id    text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc text NOT NULL,
  last_step  bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_recovery_codes (
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at   timestamptz,
  PRIMARY KEY (user_id, code_hash)
);
