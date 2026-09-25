import { randomBytes } from "node:crypto";
import { env } from "@server/env";
import { handler, json, problem } from "@server/lib/http";
import { redis } from "@server/lib/redis";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

/**
 * Builds the provider URL the administrator should visit to grant access.
 *
 * The `state` is generated here and held in Redis rather than round-tripped
 * through the browser: state exists to prove the callback belongs to a request
 * this server started, which it cannot do if the value came from the client.
 */
export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;

  const connection = await integrationsRepo.getConnection(id, workspaceId);
  if (!connection) return problem(404, "not_found", "Connection not found");

  const state = randomBytes(24).toString("base64url");
  await redis.set(`oauth:state:${state}`, `${id}:${user.id}`, "EX", 600);

  const url = new URL(connection.authorize_url);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", connection.client_id);
  url.searchParams.set("redirect_uri", `${env.publicUrl}/api/v1/admin/integrations/oauth-connections/${id}/callback`);
  if (connection.scopes.length) url.searchParams.set("scope", connection.scopes.join(" "));
  url.searchParams.set("state", state);

  return json({ authorizeUrl: url.toString(), expiresInSeconds: 600 });
});
