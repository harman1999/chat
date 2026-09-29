-- Invite links.
--
-- Invitations were left unbuilt in Phase 11 because they need outbound email,
-- and there is no mail transport here. A link needs none: an administrator
-- copies it and sends it however they like, and the invitee sets their own name
-- and password when they open it. The same model as Slack and Discord invite
-- links — a real feature, not an email invitation with the email removed.

CREATE TABLE IF NOT EXISTS invite_links (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- The token in the URL is a credential — anyone holding it can join — so it
  -- is stored as a hash, like every other secret here.
  token_hash    text NOT NULL UNIQUE,
  token_prefix  text NOT NULL,
  created_by    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  -- NULL means unlimited until it expires.
  max_uses      integer CHECK (max_uses IS NULL OR max_uses > 0),
  use_count     integer NOT NULL DEFAULT 0,
  revoked_at    timestamptz,
  -- A link only ever grants the least-privileged role. Letting a link carry
  -- Administrator would make a leaked URL a privilege escalation.
  CONSTRAINT invite_links_uses_within_limit CHECK (max_uses IS NULL OR use_count <= max_uses)
);

CREATE INDEX IF NOT EXISTS invite_links_workspace_idx
  ON invite_links (workspace_id, created_at DESC) WHERE revoked_at IS NULL;
