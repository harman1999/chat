import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { createOAuthAppSchema } from "@server/lib/schemas";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  return json(await integrationsRepo.listApps(workspaceId));
});

export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const body = await parseBody(request, createOAuthAppSchema);

  // A redirect target must be a fixed, absolute URL. Wildcards and paths that
  // are merely prefix-matched are how an authorization code ends up delivered
  // to somewhere the app never intended.
  for (const uri of body.redirectUris) {
    const parsed = new URL(uri);
    if (parsed.hash) return problem(422, "invalid_redirect", "A redirect URI cannot contain a fragment");
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      return problem(422, "invalid_redirect", "Redirect URIs must use https, except on localhost");
    }
  }

  const created = await integrationsRepo.createApp({
    workspaceId, createdBy: user.id, ...body,
  });

  await audit({
    actorId: user.id,
    action: "integration.oauth_app_created",
    category: "system",
    severity: "warning",
    target: body.name,
    request,
  });
  return json(created, { status: 201 });
});
