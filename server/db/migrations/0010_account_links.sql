-- Linked accounts.
--
-- Each workspace has its own account, joined to the others only by sharing an
-- email. Nothing verifies an email, so the shared address proves nothing on
-- its own: an administrator can create an account carrying anyone's address.
-- Switching between two accounts therefore asks for the target's password —
-- unless the two are *linked*, meaning one person has already proved they own
-- both. Accounts carry the same identity_id when they are.
--
-- A link is made when someone creates a workspace (the new account is copied
-- from the one they were signed in to), and when they switch by password.
-- It is cut when an administrator resets that account's password, so that
-- resetting a password can never be a way in to the person's other accounts.

ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_id text;

CREATE INDEX IF NOT EXISTS users_identity_idx ON users (identity_id) WHERE identity_id IS NOT NULL;
