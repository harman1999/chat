import { env } from "@server/env";
import { handler, json, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { assertSafeUrl } from "@server/lib/outbound";
import { redis } from "@server/lib/redis";
import { decryptSecret } from "@server/lib/secrets";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

/**
 * Receives the provider's redirect and exchanges the code for tokens.
 *
 * The exchange happens server-side so the client secret never reaches a
 * browser, and the resulting tokens are encrypted before they are stored.
 */
export const GET = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;

  const params = new URL(request.url).searchParams;
  const providerError = params.get("error");
  if (providerError) {
    await integrationsRepo.markConnectionError(id, providerError);
    return problem(400, "provider_refused", `The provider refused: ${providerError}`);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return problem(400, "invalid_callback", "Missing code or state");

  // Single-use: consumed here so a replayed callback cannot mint a second
  // exchange with the same state.
  const stored = await redis.getdel(`oauth:state:${state}`);
  if (stored !== `${id}:${user.id}`) {
    return problem(400, "invalid_state", "This authorization did not start here, or it expired");
  }

  const connection = await integrationsRepo.getConnection(id, workspaceId);
  if (!connection) return problem(404, "not_found", "Connection not found");

  const tokenUrl = await assertSafeUrl(connection.token_url);
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: connection.client_id,
      client_secret: decryptSecret(connection.client_secret_enc),
      redirect_uri: `${env.publicUrl}/api/v1/admin/integrations/oauth-connections/${id}/callback`,
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    await integrationsRepo.markConnectionError(id, `Token endpoint answered ${response.status}: ${detail}`);
    return problem(502, "exchange_failed", "The provider rejected the token exchange");
  }

  const payload = (await response.json()) as {
    access_token?: string; refresh_token?: string; expires_in?: number;
  };
  if (!payload.access_token) {
    await integrationsRepo.markConnectionError(id, "Token endpoint returned no access_token");
    return problem(502, "exchange_failed", "The provider returned no access token");
  }

  await integrationsRepo.storeConnectionTokens(id, {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresInSeconds: payload.expires_in ?? null,
  });

  await audit({
    actorId: user.id,
    action: "integration.oauth_connection_connected",
    category: "system",
    severity: "warning",
    target: connection.name,
    request,
  });

  // The tokens themselves are never returned to the caller.
  return json({ status: "connected", name: connection.name });
});
