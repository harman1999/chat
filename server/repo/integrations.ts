import { randomUUID } from "node:crypto";
import { query, queryOne, transaction } from "../db/client";
import { encryptSecret, generateSecret, hashSecret } from "../lib/secrets";
import type {
  BotAccount,
  IncomingWebhook,
  IntegrationToken,
  OAuthApp,
  OutgoingOAuthConnection,
  OutgoingWebhook,
  SlashCommand,
} from "../../src/types";

const id = (kind: string) => `${kind}_${randomUUID()}`;

/* -------------------------------------------------------------------------- */
/*  Bots and tokens                                                            */
/* -------------------------------------------------------------------------- */

interface BotRow {
  id: string;
  username: string;
  display_name: string;
  title: string;
  avatar_color: number;
  account_status: string;
  created_at: Date;
  token_count: string;
  last_used_at: Date | null;
}

function mapBot(row: BotRow): BotAccount {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    description: row.title,
    avatarColor: row.avatar_color,
    isActive: row.account_status === "active",
    createdAt: row.created_at.toISOString(),
    tokenCount: Number(row.token_count),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}

export const integrationsRepo = {
  async listBots(workspaceId: string): Promise<BotAccount[]> {
    const rows = await query<BotRow>(
      `SELECT u.id, u.username, u.display_name, u.title, u.avatar_color,
              u.account_status, u.created_at,
              (SELECT count(*) FROM integration_tokens t
                WHERE t.user_id = u.id AND t.revoked_at IS NULL)::text AS token_count,
              (SELECT max(t.last_used_at) FROM integration_tokens t WHERE t.user_id = u.id)
                AS last_used_at
       FROM users u
       WHERE u.workspace_id = $1 AND u.is_bot
       ORDER BY u.display_name
       LIMIT 200`,
      [workspaceId],
    );
    return rows.map(mapBot);
  },

  /**
   * Creates a bot and its first token together.
   *
   * The token is returned in plaintext exactly once, here — nothing stores it,
   * so a lost token is replaced rather than recovered.
   */
  async createBot(input: {
    workspaceId: string;
    displayName: string;
    username: string;
    description: string;
    createdBy: string;
  }): Promise<{ bot: BotAccount; token: string } | { error: "username_taken" }> {
    const clash = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE workspace_id = $1 AND username = $2`,
      [input.workspaceId, input.username],
    );
    if (clash) return { error: "username_taken" };

    const botId = id("u_bot");
    const secret = generateSecret("bot");

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO users (
           id, workspace_id, username, display_name, full_name, email, title,
           avatar_color, role, role_id, account_status, is_bot, presence)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,'member','role_member','active',true,'online')`,
        [
          botId,
          input.workspaceId,
          input.username,
          input.displayName,
          // A bot has no mailbox, but the column is NOT NULL and unique per
          // workspace; a synthetic address keeps both true without pretending
          // it is reachable.
          `${input.username}@bots.invalid`,
          input.description,
          Math.abs([...botId].reduce((hash, c) => (hash * 31 + c.charCodeAt(0)) | 0, 0)) % 8,
        ],
      );
      await client.query(
        `INSERT INTO integration_tokens (id, workspace_id, user_id, name, token_hash, token_prefix, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id("tok"),
          input.workspaceId,
          botId,
          "Default token",
          secret.hash,
          secret.prefix,
          input.createdBy,
        ],
      );
    });

    const bots = await integrationsRepo.listBots(input.workspaceId);
    const bot = bots.find((candidate) => candidate.id === botId);
    return { bot: bot as BotAccount, token: secret.plaintext };
  },

  async listTokens(botId: string): Promise<IntegrationToken[]> {
    const rows = await query<{
      id: string; name: string; token_prefix: string; created_at: Date;
      last_used_at: Date | null; revoked_at: Date | null;
    }>(
      `SELECT id, name, token_prefix, created_at, last_used_at, revoked_at
       FROM integration_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [botId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      tokenPrefix: row.token_prefix,
      createdAt: row.created_at.toISOString(),
      lastUsedAt: row.last_used_at?.toISOString() ?? null,
      isRevoked: row.revoked_at !== null,
    }));
  },

  async issueToken(input: {
    workspaceId: string;
    botId: string;
    name: string;
    createdBy: string;
  }): Promise<string> {
    const secret = generateSecret("bot");
    await query(
      `INSERT INTO integration_tokens (id, workspace_id, user_id, name, token_hash, token_prefix, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id("tok"), input.workspaceId, input.botId, input.name, secret.hash, secret.prefix, input.createdBy],
    );
    return secret.plaintext;
  },

  /** Revoked rather than deleted, so the audit trail still resolves the token. */
  async revokeToken(tokenId: string, workspaceId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE integration_tokens SET revoked_at = now()
       WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL RETURNING id`,
      [tokenId, workspaceId],
    );
    return rows.length > 0;
  },

  async setBotActive(botId: string, workspaceId: string, isActive: boolean): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE users SET account_status = $3 WHERE id = $1 AND workspace_id = $2 AND is_bot
       RETURNING id`,
      [botId, workspaceId, isActive ? "active" : "deactivated"],
    );
    return rows.length > 0;
  },

  /**
   * Enables or disables one integration.
   *
   * The table name comes from a fixed map rather than the caller, so this
   * cannot be turned into an arbitrary UPDATE by a crafted path segment.
   */
  async setEnabled(
    kind: "incoming" | "outgoing" | "command" | "app",
    id: string,
    workspaceId: string,
    isEnabled: boolean,
  ): Promise<boolean> {
    const table = {
      incoming: "incoming_webhooks",
      outgoing: "outgoing_webhooks",
      command: "slash_commands",
      app: "oauth_apps",
    }[kind];

    const rows = await query<{ id: string }>(
      `UPDATE ${table} SET is_enabled = $3 WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [id, workspaceId, isEnabled],
    );
    return rows.length > 0;
  },

  /* ------------------------------------------------------------------------ */
  /*  Incoming webhooks                                                        */
  /* ------------------------------------------------------------------------ */

  async listIncoming(workspaceId: string): Promise<IncomingWebhook[]> {
    const rows = await query<{
      id: string; name: string; channel_id: string; channel_name: string;
      bot_user_id: string; bot_name: string; secret_prefix: string;
      is_enabled: boolean; created_at: Date; last_used_at: Date | null; post_count: number;
    }>(
      `SELECT w.id, w.name, w.channel_id, c.name AS channel_name, w.bot_user_id,
              b.display_name AS bot_name, w.secret_prefix, w.is_enabled,
              w.created_at, w.last_used_at, w.post_count
       FROM incoming_webhooks w
       JOIN channels c ON c.id = w.channel_id
       JOIN users b ON b.id = w.bot_user_id
       WHERE w.workspace_id = $1 ORDER BY w.created_at DESC LIMIT 200`,
      [workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      channelId: row.channel_id,
      channelName: row.channel_name,
      botUserId: row.bot_user_id,
      botName: row.bot_name,
      secretPrefix: row.secret_prefix,
      isEnabled: row.is_enabled,
      createdAt: row.created_at.toISOString(),
      lastUsedAt: row.last_used_at?.toISOString() ?? null,
      postCount: row.post_count,
    }));
  },

  async createIncoming(input: {
    workspaceId: string;
    channelId: string;
    botUserId: string;
    name: string;
    createdBy: string;
  }): Promise<{ id: string; secret: string }> {
    const hookId = id("ihook");
    const secret = generateSecret("hook");
    await query(
      `INSERT INTO incoming_webhooks
         (id, workspace_id, channel_id, bot_user_id, name, secret_hash, secret_prefix, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        hookId, input.workspaceId, input.channelId, input.botUserId,
        input.name, secret.hash, secret.prefix, input.createdBy,
      ],
    );
    return { id: hookId, secret: secret.plaintext };
  },

  /** Resolves the secret presented in a webhook URL to its target. */
  async findIncomingBySecret(secret: string) {
    return queryOne<{
      id: string; channel_id: string; bot_user_id: string; workspace_id: string; is_enabled: boolean;
    }>(
      `SELECT id, channel_id, bot_user_id, workspace_id, is_enabled
       FROM incoming_webhooks WHERE secret_hash = $1`,
      [hashSecret(secret)],
    );
  },

  async recordIncomingUse(hookId: string): Promise<void> {
    await query(
      `UPDATE incoming_webhooks SET last_used_at = now(), post_count = post_count + 1
       WHERE id = $1`,
      [hookId],
    );
  },

  async deleteIncoming(hookId: string, workspaceId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `DELETE FROM incoming_webhooks WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [hookId, workspaceId],
    );
    return rows.length > 0;
  },

  /* ------------------------------------------------------------------------ */
  /*  Outgoing webhooks                                                        */
  /* ------------------------------------------------------------------------ */

  async listOutgoing(workspaceId: string): Promise<OutgoingWebhook[]> {
    const rows = await query<{
      id: string; name: string; channel_id: string | null; channel_name: string | null;
      target_url: string; trigger_words: string[]; is_enabled: boolean; created_at: Date;
      connection_id: string | null; connection_name: string | null;
      last_attempt_at: Date | null; last_status: number | null; last_error: string | null;
      failure_count: number;
    }>(
      `SELECT w.id, w.name, w.channel_id, c.name AS channel_name, w.target_url,
              w.trigger_words, w.is_enabled, w.created_at, w.last_attempt_at,
              w.last_status, w.last_error, w.failure_count,
              w.connection_id, oc.name AS connection_name
       FROM outgoing_webhooks w
       LEFT JOIN channels c ON c.id = w.channel_id
       LEFT JOIN outgoing_oauth_connections oc ON oc.id = w.connection_id
       WHERE w.workspace_id = $1 ORDER BY w.created_at DESC LIMIT 200`,
      [workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      channelId: row.channel_id,
      channelName: row.channel_name,
      targetUrl: row.target_url,
      triggerWords: row.trigger_words,
      connectionId: row.connection_id,
      connectionName: row.connection_name,
      isEnabled: row.is_enabled,
      createdAt: row.created_at.toISOString(),
      lastAttemptAt: row.last_attempt_at?.toISOString() ?? null,
      lastStatus: row.last_status,
      lastError: row.last_error,
      failureCount: row.failure_count,
    }));
  },

  async createOutgoing(input: {
    workspaceId: string;
    channelId: string | null;
    name: string;
    targetUrl: string;
    triggerWords: string[];
    connectionId?: string | null;
    createdBy: string;
  }): Promise<{ id: string; signingSecret: string }> {
    const hookId = id("ohook");
    const signingSecret = generateSecret("sign").plaintext;
    await query(
      `INSERT INTO outgoing_webhooks
         (id, workspace_id, channel_id, name, target_url, trigger_words, signing_secret,
          connection_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        hookId, input.workspaceId, input.channelId, input.name,
        input.targetUrl, input.triggerWords, signingSecret,
        input.connectionId ?? null, input.createdBy,
      ],
    );
    return { id: hookId, signingSecret };
  },

  /** The webhooks a message should be delivered to, matched in SQL. */
  async matchOutgoing(workspaceId: string, channelId: string, body: string) {
    const firstWord = body.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    return query<{
      id: string; target_url: string; signing_secret: string; name: string;
      connection_id: string | null;
    }>(
      `SELECT id, target_url, signing_secret, name, connection_id
       FROM outgoing_webhooks
       WHERE workspace_id = $1 AND is_enabled
         AND (channel_id IS NULL OR channel_id = $2)
         AND (cardinality(trigger_words) = 0 OR $3 = ANY(trigger_words))
       LIMIT 20`,
      [workspaceId, channelId, firstWord],
    );
  },

  async recordDelivery(
    hookId: string,
    result: { ok: boolean; status: number | null; error: string | null },
  ): Promise<void> {
    await query(
      `UPDATE outgoing_webhooks
         SET last_attempt_at = now(), last_status = $2, last_error = $3,
             failure_count = CASE WHEN $4 THEN 0 ELSE failure_count + 1 END
       WHERE id = $1`,
      [hookId, result.status, result.error?.slice(0, 500) ?? null, result.ok],
    );
  },

  async deleteOutgoing(hookId: string, workspaceId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `DELETE FROM outgoing_webhooks WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [hookId, workspaceId],
    );
    return rows.length > 0;
  },

  /* ------------------------------------------------------------------------ */
  /*  Slash commands                                                           */
  /* ------------------------------------------------------------------------ */

  async listCommands(workspaceId: string): Promise<SlashCommand[]> {
    const rows = await query<{
      id: string; command: string; name: string; description: string; usage_hint: string;
      target_url: string; is_enabled: boolean; created_at: Date; last_used_at: Date | null;
      connection_id: string | null; connection_name: string | null;
    }>(
      `SELECT s.id, s.command, s.name, s.description, s.usage_hint, s.target_url,
              s.is_enabled, s.created_at, s.last_used_at,
              s.connection_id, oc.name AS connection_name
       FROM slash_commands s
       LEFT JOIN outgoing_oauth_connections oc ON oc.id = s.connection_id
       WHERE s.workspace_id = $1 ORDER BY s.command LIMIT 200`,
      [workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      command: row.command,
      name: row.name,
      description: row.description,
      usageHint: row.usage_hint,
      targetUrl: row.target_url,
      connectionId: row.connection_id,
      connectionName: row.connection_name,
      isEnabled: row.is_enabled,
      createdAt: row.created_at.toISOString(),
      lastUsedAt: row.last_used_at?.toISOString() ?? null,
    }));
  },

  async createCommand(input: {
    workspaceId: string;
    command: string;
    name: string;
    description: string;
    usageHint: string;
    targetUrl: string;
    connectionId?: string | null;
    createdBy: string;
  }): Promise<{ id: string; signingSecret: string } | { error: "command_taken" }> {
    const taken = await queryOne<{ id: string }>(
      `SELECT id FROM slash_commands WHERE workspace_id = $1 AND command = $2`,
      [input.workspaceId, input.command],
    );
    if (taken) return { error: "command_taken" };

    const commandId = id("cmd");
    const signingSecret = generateSecret("sign").plaintext;
    await query(
      `INSERT INTO slash_commands
         (id, workspace_id, command, name, description, usage_hint, target_url, signing_secret,
          connection_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        commandId, input.workspaceId, input.command, input.name, input.description,
        input.usageHint, input.targetUrl, signingSecret,
        input.connectionId ?? null, input.createdBy,
      ],
    );
    return { id: commandId, signingSecret };
  },

  async findCommand(workspaceId: string, command: string) {
    return queryOne<{
      id: string; target_url: string; signing_secret: string; command: string;
      connection_id: string | null;
    }>(
      `SELECT id, target_url, signing_secret, command, connection_id FROM slash_commands
       WHERE workspace_id = $1 AND command = $2 AND is_enabled`,
      [workspaceId, command],
    );
  },

  async recordCommandUse(commandId: string): Promise<void> {
    await query(`UPDATE slash_commands SET last_used_at = now() WHERE id = $1`, [commandId]);
  },

  async deleteCommand(commandId: string, workspaceId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `DELETE FROM slash_commands WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [commandId, workspaceId],
    );
    return rows.length > 0;
  },

  /* ------------------------------------------------------------------------ */
  /*  OAuth applications                                                       */
  /* ------------------------------------------------------------------------ */

  async listApps(workspaceId: string): Promise<OAuthApp[]> {
    const rows = await query<{
      id: string; name: string; description: string; client_id: string;
      client_secret_prefix: string; redirect_uris: string[]; scopes: string[];
      is_enabled: boolean; created_at: Date; authorised: string;
    }>(
      `SELECT a.id, a.name, a.description, a.client_id, a.client_secret_prefix,
              a.redirect_uris, a.scopes, a.is_enabled, a.created_at,
              (SELECT count(DISTINCT t.user_id) FROM oauth_access_tokens t
                WHERE t.app_id = a.id AND t.revoked_at IS NULL)::text AS authorised
       FROM oauth_apps a WHERE a.workspace_id = $1
       ORDER BY a.created_at DESC LIMIT 200`,
      [workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      clientId: row.client_id,
      clientSecretPrefix: row.client_secret_prefix,
      redirectUris: row.redirect_uris,
      scopes: row.scopes,
      isEnabled: row.is_enabled,
      createdAt: row.created_at.toISOString(),
      authorisedUsers: Number(row.authorised),
    }));
  },

  async createApp(input: {
    workspaceId: string;
    name: string;
    description: string;
    redirectUris: string[];
    scopes: string[];
    createdBy: string;
  }): Promise<{ id: string; clientId: string; clientSecret: string }> {
    const appId = id("app");
    const clientId = `helix_${randomUUID().replace(/-/g, "")}`;
    const secret = generateSecret("cs");
    await query(
      `INSERT INTO oauth_apps
         (id, workspace_id, name, description, client_id, client_secret_hash,
          client_secret_prefix, redirect_uris, scopes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        appId, input.workspaceId, input.name, input.description, clientId,
        secret.hash, secret.prefix, input.redirectUris, input.scopes, input.createdBy,
      ],
    );
    return { id: appId, clientId, clientSecret: secret.plaintext };
  },

  async findAppByClientId(clientId: string) {
    return queryOne<{
      id: string; workspace_id: string; name: string; client_secret_hash: string;
      redirect_uris: string[]; scopes: string[]; is_enabled: boolean;
    }>(
      `SELECT id, workspace_id, name, client_secret_hash, redirect_uris, scopes, is_enabled
       FROM oauth_apps WHERE client_id = $1`,
      [clientId],
    );
  },

  async deleteApp(appId: string, workspaceId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `DELETE FROM oauth_apps WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [appId, workspaceId],
    );
    return rows.length > 0;
  },

  /* ------------------------------------------------------------------------ */
  /*  Outgoing OAuth connections                                               */
  /* ------------------------------------------------------------------------ */

  async listConnections(workspaceId: string): Promise<OutgoingOAuthConnection[]> {
    const rows = await query<{
      id: string; name: string; provider: string; client_id: string;
      authorize_url: string; token_url: string; scopes: string[]; status: string;
      last_error: string | null; created_at: Date; connected_at: Date | null;
      token_expires_at: Date | null;
    }>(
      `SELECT id, name, provider, client_id, authorize_url, token_url, scopes,
              status, last_error, created_at, connected_at, token_expires_at
       FROM outgoing_oauth_connections WHERE workspace_id = $1
       ORDER BY name LIMIT 200`,
      [workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      clientId: row.client_id,
      authorizeUrl: row.authorize_url,
      tokenUrl: row.token_url,
      scopes: row.scopes,
      status: row.status as OutgoingOAuthConnection["status"],
      lastError: row.last_error,
      createdAt: row.created_at.toISOString(),
      connectedAt: row.connected_at?.toISOString() ?? null,
      tokenExpiresAt: row.token_expires_at?.toISOString() ?? null,
    }));
  },

  async createConnection(input: {
    workspaceId: string;
    name: string;
    provider: string;
    clientId: string;
    clientSecret: string;
    authorizeUrl: string;
    tokenUrl: string;
    scopes: string[];
    createdBy: string;
  }): Promise<{ id: string } | { error: "name_taken" }> {
    const taken = await queryOne<{ id: string }>(
      `SELECT id FROM outgoing_oauth_connections WHERE workspace_id = $1 AND name = $2`,
      [input.workspaceId, input.name],
    );
    if (taken) return { error: "name_taken" };

    const connectionId = id("conn");
    await query(
      `INSERT INTO outgoing_oauth_connections
         (id, workspace_id, name, provider, client_id, client_secret_enc,
          authorize_url, token_url, scopes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        connectionId, input.workspaceId, input.name, input.provider, input.clientId,
        // Encrypted, not hashed: we have to send this to the provider.
        encryptSecret(input.clientSecret),
        input.authorizeUrl, input.tokenUrl, input.scopes, input.createdBy,
      ],
    );
    return { id: connectionId };
  },

  async getConnection(connectionId: string, workspaceId: string) {
    return queryOne<{
      id: string; name: string; client_id: string; client_secret_enc: string;
      authorize_url: string; token_url: string; scopes: string[];
    }>(
      `SELECT id, name, client_id, client_secret_enc, authorize_url, token_url, scopes
       FROM outgoing_oauth_connections WHERE id = $1 AND workspace_id = $2`,
      [connectionId, workspaceId],
    );
  },

  async storeConnectionTokens(
    connectionId: string,
    tokens: { accessToken: string; refreshToken?: string | null; expiresInSeconds?: number | null },
  ): Promise<void> {
    await query(
      `UPDATE outgoing_oauth_connections
         SET access_token_enc = $2, refresh_token_enc = $3,
             token_expires_at = CASE WHEN $4::int IS NULL THEN NULL
                                     ELSE now() + ($4::int || ' seconds')::interval END,
             status = 'connected', connected_at = now(), last_error = NULL
       WHERE id = $1`,
      [
        connectionId,
        encryptSecret(tokens.accessToken),
        tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
        tokens.expiresInSeconds ?? null,
      ],
    );
  },

  async markConnectionError(connectionId: string, message: string): Promise<void> {
    await query(
      `UPDATE outgoing_oauth_connections SET status = 'error', last_error = $2 WHERE id = $1`,
      [connectionId, message.slice(0, 500)],
    );
  },

  async deleteConnection(connectionId: string, workspaceId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `DELETE FROM outgoing_oauth_connections WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [connectionId, workspaceId],
    );
    return rows.length > 0;
  },
};
