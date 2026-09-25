-- =============================================================================
-- Helix schema
--
-- Conventions:
--   * Text ids, matching the ids the client already uses (u_…, ch_…, m_…), so
--     seeded data and client-side fixtures line up during the migration.
--   * timestamptz everywhere; the application never stores local time.
--   * ON DELETE CASCADE from the owning aggregate, so removing a channel or a
--     message cleans up its dependents in one statement.
-- =============================================================================

CREATE TABLE IF NOT EXISTS workspaces (
  id            text PRIMARY KEY,
  name          text        NOT NULL,
  slug          text        NOT NULL UNIQUE,
  initials      text        NOT NULL,
  plan          text        NOT NULL DEFAULT 'business'
                            CHECK (plan IN ('free', 'business', 'enterprise')),
  settings      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             text PRIMARY KEY,
  workspace_id   text        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  username       text        NOT NULL,
  display_name   text        NOT NULL,
  full_name      text        NOT NULL,
  email          text        NOT NULL,
  password_hash  text,
  title          text        NOT NULL DEFAULT '',
  department     text        NOT NULL DEFAULT '',
  timezone       text        NOT NULL DEFAULT 'UTC',
  avatar_url     text,
  avatar_color   smallint    NOT NULL DEFAULT 0,
  presence       text        NOT NULL DEFAULT 'offline'
                             CHECK (presence IN ('online', 'away', 'dnd', 'offline')),
  status_emoji   text,
  status_text    text,
  status_expires_at timestamptz,
  role           text        NOT NULL DEFAULT 'member'
                             CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  role_id        text,
  account_status text        NOT NULL DEFAULT 'active'
                             CHECK (account_status IN ('active', 'invited', 'deactivated')),
  is_bot         boolean     NOT NULL DEFAULT false,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, username),
  UNIQUE (workspace_id, email)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id     text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferences jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id            text PRIMARY KEY,
  user_id       text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_kind   text        NOT NULL DEFAULT 'web',
  device_label  text        NOT NULL DEFAULT 'Unknown device',
  browser       text        NOT NULL DEFAULT '',
  location      text        NOT NULL DEFAULT '',
  ip_address    inet,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, last_active_at DESC);

CREATE TABLE IF NOT EXISTS channels (
  id            text PRIMARY KEY,
  workspace_id  text        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind          text        NOT NULL
                            CHECK (kind IN ('public', 'private', 'dm', 'group_dm')),
  name          text        NOT NULL,
  purpose       text        NOT NULL DEFAULT '',
  description   text        NOT NULL DEFAULT '',
  topic         text,
  member_count  integer     NOT NULL DEFAULT 0,
  is_archived   boolean     NOT NULL DEFAULT false,
  last_message_at timestamptz,
  created_by    text        REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channels_workspace_idx ON channels (workspace_id, kind);

-- Per-member state lives here, not on the channel: unread counts and mute are
-- different for every member of the same channel.
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id     text        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id        text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_muted       boolean     NOT NULL DEFAULT false,
  is_favorite    boolean     NOT NULL DEFAULT false,
  last_read_at   timestamptz NOT NULL DEFAULT now(),
  joined_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS channel_members_user_idx ON channel_members (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id             text PRIMARY KEY,
  channel_id     text        NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           text        NOT NULL DEFAULT 'text'
                             CHECK (kind IN ('text', 'system_join', 'system_leave', 'system_topic')),
  body           text        NOT NULL DEFAULT '',
  thread_root_id text        REFERENCES messages(id) ON DELETE CASCADE,
  is_pinned      boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  edited_at      timestamptz,
  deleted_at     timestamptz
);
-- The message list pages backwards from newest within a channel.
CREATE INDEX IF NOT EXISTS messages_channel_created_idx
  ON messages (channel_id, created_at DESC, id DESC)
  WHERE thread_root_id IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS messages_thread_idx
  ON messages (thread_root_id, created_at)
  WHERE thread_root_id IS NOT NULL;
-- Full-text search over message bodies.
CREATE INDEX IF NOT EXISTS messages_body_fts_idx
  ON messages USING gin (to_tsvector('english', body));

CREATE TABLE IF NOT EXISTS message_mentions (
  message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS message_mentions_user_idx ON message_mentions (user_id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id text        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      text        NOT NULL,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS attachments (
  id            text PRIMARY KEY,
  message_id    text        REFERENCES messages(id) ON DELETE CASCADE,
  channel_id    text        REFERENCES channels(id) ON DELETE CASCADE,
  uploaded_by   text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  kind          text        NOT NULL,
  mime_type     text        NOT NULL,
  size_bytes    bigint      NOT NULL,
  storage_key   text        NOT NULL,
  width         integer,
  height        integer,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_message_idx ON attachments (message_id);

CREATE TABLE IF NOT EXISTS message_saves (
  user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id text        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

CREATE TABLE IF NOT EXISTS thread_follows (
  user_id       text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  root_id       text        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL DEFAULT to_timestamp(0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, root_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id          text PRIMARY KEY,
  user_id     text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text        NOT NULL
                          CHECK (kind IN ('mention','direct_message','thread_reply','channel_message','system')),
  actor_id    text        REFERENCES users(id) ON DELETE SET NULL,
  channel_id  text        REFERENCES channels(id) ON DELETE CASCADE,
  message_id  text        REFERENCES messages(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  preview     text        NOT NULL DEFAULT '',
  is_read     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS roles (
  id           text PRIMARY KEY,
  workspace_id text        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  description  text        NOT NULL DEFAULT '',
  is_system    boolean     NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS permissions (
  id          text PRIMARY KEY,
  grp         text NOT NULL,
  label       text NOT NULL,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id text NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          text PRIMARY KEY,
  workspace_id text       NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id    text        REFERENCES users(id) ON DELETE SET NULL,
  action      text        NOT NULL,
  category    text        NOT NULL,
  severity    text        NOT NULL DEFAULT 'info',
  target      text        NOT NULL DEFAULT '',
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_workspace_idx ON audit_log (workspace_id, created_at DESC);
