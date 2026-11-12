import { query, queryOne } from "../db/client";
import { decryptSecret, encryptSecret } from "../lib/secrets";

export interface SsoConfig {
  enabled: boolean;
  label: string;
  issuer: string;
  clientId: string;
  hasSecret: boolean;
  allowedDomains: string[];
  autoCreate: boolean;
  /** Password sign-in is off for everyone but the owner. */
  enforced: boolean;
}

interface Row {
  enabled: boolean;
  label: string;
  issuer: string;
  client_id: string;
  client_secret_enc: string | null;
  allowed_domains: string[];
  auto_create: boolean;
  enforced: boolean;
}

const COLUMNS = `enabled, label, issuer, client_id, client_secret_enc, allowed_domains, auto_create, enforced`;

function map(row: Row): SsoConfig {
  return {
    enabled: row.enabled,
    label: row.label,
    issuer: row.issuer,
    clientId: row.client_id,
    hasSecret: Boolean(row.client_secret_enc),
    allowedDomains: row.allowed_domains,
    autoCreate: row.auto_create,
    enforced: row.enforced,
  };
}

export const ssoRepo = {
  /** What an administrator sees. The secret is never part of it. */
  async get(workspaceId: string): Promise<SsoConfig | null> {
    const row = await queryOne<Row>(`SELECT ${COLUMNS} FROM sso_providers WHERE workspace_id = $1`, [workspaceId]);
    return row ? map(row) : null;
  },

  /** What a sign-in needs, including the decrypted secret. Server-side only. */
  async forSignIn(workspaceId: string): Promise<(SsoConfig & { clientSecret: string | null }) | null> {
    const row = await queryOne<Row>(`SELECT ${COLUMNS} FROM sso_providers WHERE workspace_id = $1`, [workspaceId]);
    if (!row) return null;
    return { ...map(row), clientSecret: row.client_secret_enc ? decryptSecret(row.client_secret_enc) : null };
  },

  /** `clientSecret` undefined keeps the stored one. */
  async save(
    workspaceId: string,
    input: Omit<SsoConfig, "hasSecret"> & { clientSecret?: string },
  ): Promise<void> {
    await query(
      `INSERT INTO sso_providers
         (workspace_id, enabled, label, issuer, client_id, client_secret_enc, allowed_domains, auto_create, enforced, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (workspace_id) DO UPDATE SET
         enabled = EXCLUDED.enabled, label = EXCLUDED.label, issuer = EXCLUDED.issuer,
         client_id = EXCLUDED.client_id,
         client_secret_enc = COALESCE($6, sso_providers.client_secret_enc),
         allowed_domains = EXCLUDED.allowed_domains, auto_create = EXCLUDED.auto_create,
         enforced = EXCLUDED.enforced, updated_at = now()`,
      [
        workspaceId,
        input.enabled,
        input.label,
        input.issuer,
        input.clientId,
        input.clientSecret ? encryptSecret(input.clientSecret) : null,
        input.allowedDomains,
        input.autoCreate,
        input.enforced,
      ],
    );
  },

  /** Whether password sign-in is switched off in this workspace. */
  async isEnforced(workspaceId: string): Promise<boolean> {
    const row = await queryOne<{ x: boolean }>(
      `SELECT (enabled AND enforced) AS x FROM sso_providers WHERE workspace_id = $1`,
      [workspaceId],
    );
    return row?.x ?? false;
  },

  /**
   * The workspace a sign-in page is for: the one named, or the only one there
   * is. With several and none named there is no single answer, so none.
   */
  async loginWorkspace(slug?: string | null): Promise<{ id: string; slug: string; name: string } | null> {
    const rows = await query<{ id: string; slug: string; name: string }>(
      `SELECT id, slug, name FROM workspaces
        WHERE archived_at IS NULL AND ($1::text IS NULL OR slug = $1)
        ORDER BY created_at LIMIT 2`,
      [slug ?? null],
    );
    return rows.length === 1 ? rows[0] : null;
  },

  async userForIdentity(workspaceId: string, issuer: string, subject: string): Promise<string | null> {
    const row = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM sso_identities WHERE workspace_id = $1 AND issuer = $2 AND subject = $3`,
      [workspaceId, issuer, subject],
    );
    return row?.user_id ?? null;
  },

  async link(workspaceId: string, issuer: string, subject: string, userId: string): Promise<void> {
    await query(
      `INSERT INTO sso_identities (workspace_id, issuer, subject, user_id) VALUES ($1,$2,$3,$4)
       ON CONFLICT (workspace_id, issuer, subject) DO NOTHING`,
      [workspaceId, issuer, subject, userId],
    );
  },

  async hasIdentity(userId: string): Promise<boolean> {
    const row = await queryOne<{ x: number }>(`SELECT 1 AS x FROM sso_identities WHERE user_id = $1 LIMIT 1`, [userId]);
    return Boolean(row);
  },
};
