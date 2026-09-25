import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { assertSafeUrl, OutboundError } from "@server/lib/outbound";
import { createOAuthConnectionSchema } from "@server/lib/schemas";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  // Never returns the client secret or the tokens — only their status.
  return json(await integrationsRepo.listConnections(workspaceId));
});

export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const body = await parseBody(request, createOAuthConnectionSchema);

  // The token URL is fetched by this server, so it gets the same treatment as
  // any other outbound target.
  for (const url of [body.authorizeUrl, body.tokenUrl]) {
    try {
      await assertSafeUrl(url);
    } catch (error) {
      if (error instanceof OutboundError) return problem(422, "unsafe_url", error.message);
      throw error;
    }
  }

  const result = await integrationsRepo.createConnection({
    workspaceId, createdBy: user.id, ...body,
  });
  if ("error" in result) {
    return problem(409, "name_taken", `A connection named "${body.name}" already exists`);
  }

  await audit({
    actorId: user.id,
    action: "integration.oauth_connection_created",
    category: "system",
    severity: "warning",
    target: body.name,
    request,
  });
  return json({ id: result.id }, { status: 201 });
});
