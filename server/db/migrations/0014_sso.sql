-- Single sign-on (OpenID Connect).
--
-- One provider per workspace. The client secret is the one thing here that has
-- to be read back (to authenticate to the provider), so it is encrypted, not
-- hashed — the same way outgoing OAuth credentials are.
--
-- `allowed_domains` limits whose email may sign in. `auto_create` lets a person
-- who signs in with no matching account get one (as a Member); it is only
-- allowed with at least one domain listed, enforced where it is saved.
-- `enforced` turns off password sign-in for everyone but the owner.

CREATE TABLE IF NOT EXISTS sso_providers (
  workspace_id      text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  enabled           boolean NOT NULL DEFAULT false,
  label             text NOT NULL DEFAULT 'Single sign-on',
  issuer            text NOT NULL,
  client_id         text NOT NULL,
  client_secret_enc text,
  allowed_domains   text[] NOT NULL DEFAULT '{}',
  auto_create       boolean NOT NULL DEFAULT false,
  enforced          boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Which provider identity belongs to which person. The provider's stable id
-- (`sub`) is what identifies them afterwards, not their email, which can change.
CREATE TABLE IF NOT EXISTS sso_identities (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issuer       text NOT NULL,
  subject      text NOT NULL,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, issuer, subject)
);

CREATE INDEX IF NOT EXISTS sso_identities_user_idx ON sso_identities (user_id);
