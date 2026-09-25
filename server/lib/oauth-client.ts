import { queryOne } from "../db/client";
import { assertSafeUrl } from "./outbound";
import { decryptSecret } from "./secrets";
import { integrationsRepo } from "../repo/integrations";

/**
 * Uses an outgoing OAuth connection.
 *
 * Until this existed, the connection flow stored an access token that nothing
 * ever read: a credential store with an OAuth dance in front of it. This is the
 * consumer — it hands out a usable access token, refreshing first when the
 * stored one has expired or is about to.
 */

/** Refresh this far before expiry, so a token does not die mid-request. */
const REFRESH_MARGIN_MS = 60_000;

export interface ConnectionToken {
  accessToken: string;
  connectionName: string;
}

interface TokenRow {
  id: string;
  name: string;
  client_id: string;
  client_secret_enc: string;
  token_url: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: Date | null;
  status: string;
}

/**
 * Returns a usable access token, or null with the reason recorded against the
 * connection.
 *
 * Never throws: a dead connection is a configuration problem to surface in the
 * admin list, not an exception that fails whatever was trying to use it.
 */
export async function getConnectionToken(
  connectionId: string,
  workspaceId: string,
): Promise<ConnectionToken | null> {
  const row = await queryOne<TokenRow>(
    `SELECT id, name, client_id, client_secret_enc, token_url,
            access_token_enc, refresh_token_enc, token_expires_at, status
     FROM outgoing_oauth_connections WHERE id = $1 AND workspace_id = $2`,
    [connectionId, workspaceId],
  );
  if (!row) return null;

  if (!row.access_token_enc) {
    await integrationsRepo.markConnectionError(row.id, "Not authorised yet");
    return null;
  }

  const expiresAt = row.token_expires_at?.getTime();
  const isStale = expiresAt !== undefined && expiresAt - Date.now() < REFRESH_MARGIN_MS;

  // A connection with no expiry is treated as long-lived; some providers issue
  // tokens that do not expire, and refreshing one we cannot refresh is worse
  // than using it.
  if (!isStale) {
    return { accessToken: decryptSecret(row.access_token_enc), connectionName: row.name };
  }

  if (!row.refresh_token_enc) {
    await integrationsRepo.markConnectionError(
      row.id,
      "The access token expired and the provider issued no refresh token — reconnect it",
    );
    return null;
  }

  return refresh(row);
}

async function refresh(row: TokenRow): Promise<ConnectionToken | null> {
  try {
    const tokenUrl = await assertSafeUrl(row.token_url);
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decryptSecret(row.refresh_token_enc as string),
        client_id: row.client_id,
        client_secret: decryptSecret(row.client_secret_enc),
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      await integrationsRepo.markConnectionError(
        row.id,
        `Refresh failed (${response.status}): ${detail}`,
      );
      return null;
    }

    const payload = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token) {
      await integrationsRepo.markConnectionError(row.id, "Refresh returned no access_token");
      return null;
    }

    await integrationsRepo.storeConnectionTokens(row.id, {
      accessToken: payload.access_token,
      // Providers that rotate refresh tokens return a new one; those that do
      // not expect the old one to keep working, so it is kept.
      refreshToken: payload.refresh_token ?? decryptSecret(row.refresh_token_enc as string),
      expiresInSeconds: payload.expires_in ?? null,
    });

    return { accessToken: payload.access_token, connectionName: row.name };
  } catch (error) {
    await integrationsRepo.markConnectionError(row.id, `Refresh failed: ${String(error)}`);
    return null;
  }
}
