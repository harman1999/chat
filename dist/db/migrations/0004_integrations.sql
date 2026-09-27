-- Integrations: bot accounts, webhooks, slash commands and OAuth.
--
-- A bot is a `users` row with is_bot = true, not a parallel actor type. That
-- decision carries the whole feature: a bot already has a workspace, channel
-- memberships, a display name and an avatar, and every existing route,
-- permission check and message query works for it unchanged. Authenticating a
-- bot is then only a matter of resolving a token to that user id.

-- ---------------------------------------------------------------------------
-- Credentials
-- ---------------------------------------------------------------------------

-- Tokens are stored as SHA-256, not scrypt. A password is low-entropy and needs
-- a deliberately slow hash; a 256-bit random token does not, and a slow hash on
-- the authentication path of every bot request would be a self-inflicted DoS.
CREATE TABLE IF NOT EXISTS integration_tokens (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  -- The actor this token authenticates as.
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  -- The leading characters, so a token is recognisable in a list without being
  -- recoverable from it.
  token_prefix  text NOT NULL,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS integration_tokens_user_idx
  ON integration_tokens (user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Incoming webhooks — an external system posts into a channel
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS incoming_webhooks (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  channel_id    text NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  -- Messages are attributed to this bot, so they render like any other message.
  bot_user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  -- The URL path segment is the credential, so it is hashed like one.
  secret_hash   text NOT NULL UNIQUE,
  secret_prefix text NOT NULL,
  is_enabled    boolean NOT NULL DEFAULT true,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  post_count    integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS incoming_webhooks_workspace_idx
  ON incoming_webhooks (workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Outgoing webhooks — a matching message is posted to an external URL
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS outgoing_webhooks (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  -- NULL means every channel the workspace has.
  channel_id    text REFERENCES channels(id) ON DELETE CASCADE,
  name          text NOT NULL,
  target_url    text NOT NULL,
  -- Empty means every message in scope; otherwise the message must start with
  -- one of these words.
  trigger_words text[] NOT NULL DEFAULT '{}',
  -- Used to sign each delivery so the receiver can verify it came from here.
  signing_secret text NOT NULL,
  is_enabled    boolean NOT NULL DEFAULT true,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Delivery health, so a broken endpoint is visible rather than silent.
  last_attempt_at timestamptz,
  last_status     integer,
  last_error      text,
  failure_count   integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS outgoing_webhooks_channel_idx
  ON outgoing_webhooks (workspace_id, channel_id) WHERE is_enabled;

-- ---------------------------------------------------------------------------
-- Slash commands
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS slash_commands (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  -- Stored without the leading slash, lowercased.
  command       text NOT NULL,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  -- Shown in the composer's autocomplete, e.g. "[city]".
  usage_hint    text NOT NULL DEFAULT '',
  target_url    text NOT NULL,
  signing_secret text NOT NULL,
  is_enabled    boolean NOT NULL DEFAULT true,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  UNIQUE (workspace_id, command)
);

-- ---------------------------------------------------------------------------
-- OAuth 2.0 applications — third parties acting on a user's behalf
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS oauth_apps (
  id              text PRIMARY KEY,
  workspace_id    text NOT NULL,
  name            text NOT NULL,
  description     text NOT NULL DEFAULT '',
  client_id       text NOT NULL UNIQUE,
  client_secret_hash   text NOT NULL,
  client_secret_prefix text NOT NULL,
  -- Matched exactly at both authorize and token time; a prefix match is how
  -- redirect_uri validation gets turned into an open redirect.
  redirect_uris   text[] NOT NULL DEFAULT '{}',
  scopes          text[] NOT NULL DEFAULT '{}',
  is_enabled      boolean NOT NULL DEFAULT true,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash       text PRIMARY KEY,
  app_id          text NOT NULL REFERENCES oauth_apps(id) ON DELETE CASCADE,
  user_id         text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri    text NOT NULL,
  scopes          text[] NOT NULL DEFAULT '{}',
  -- PKCE is required rather than optional: without it an intercepted code is
  -- redeemable by whoever holds it.
  code_challenge  text NOT NULL,
  code_challenge_method text NOT NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz
);

CREATE INDEX IF NOT EXISTS oauth_codes_expiry_idx ON oauth_authorization_codes (expires_at);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id                 text PRIMARY KEY,
  app_id             text NOT NULL REFERENCES oauth_apps(id) ON DELETE CASCADE,
  user_id            text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash         text NOT NULL UNIQUE,
  refresh_token_hash text UNIQUE,
  scopes             text[] NOT NULL DEFAULT '{}',
  expires_at         timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz
);

CREATE INDEX IF NOT EXISTS oauth_tokens_user_app_idx
  ON oauth_access_tokens (user_id, app_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Outgoing OAuth connections — this workspace authenticating to someone else
-- ---------------------------------------------------------------------------

-- The only place in the schema holding a secret it must be able to *read back*.
-- Everything else here is hashed, because everything else is only ever
-- compared. These are encrypted with AES-256-GCM instead; the ciphertext column
-- names say so, so nobody mistakes them for hashes.
CREATE TABLE IF NOT EXISTS outgoing_oauth_connections (
  id                  text PRIMARY KEY,
  workspace_id        text NOT NULL,
  name                text NOT NULL,
  -- Free text: "GitHub", "Jira", an internal service.
  provider            text NOT NULL DEFAULT '',
  client_id           text NOT NULL,
  client_secret_enc   text NOT NULL,
  authorize_url       text NOT NULL,
  token_url           text NOT NULL,
  scopes              text[] NOT NULL DEFAULT '{}',
  access_token_enc    text,
  refresh_token_enc   text,
  token_expires_at    timestamptz,
  -- 'disconnected' until a token is obtained, then 'connected' or 'error'.
  status              text NOT NULL DEFAULT 'disconnected',
  last_error          text,
  created_by          text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  connected_at        timestamptz,
  UNIQUE (workspace_id, name)
);
