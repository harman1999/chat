-- Lets an outgoing integration authenticate with a stored OAuth connection.
--
-- Until now the connection flow stored an access token that nothing ever read.
-- These columns give it a consumer: when set, the delivery carries
-- `Authorization: Bearer <that connection's token>`, refreshed on demand.

ALTER TABLE outgoing_webhooks
  ADD COLUMN IF NOT EXISTS connection_id text
    REFERENCES outgoing_oauth_connections(id) ON DELETE SET NULL;

ALTER TABLE slash_commands
  ADD COLUMN IF NOT EXISTS connection_id text
    REFERENCES outgoing_oauth_connections(id) ON DELETE SET NULL;

-- ON DELETE SET NULL rather than CASCADE: deleting a connection must not
-- silently delete the webhooks that used it. They keep working unauthenticated,
-- which is visible, instead of disappearing.
