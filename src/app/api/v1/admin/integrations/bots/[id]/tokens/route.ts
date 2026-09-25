import { handler, json, parseBody } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { issueTokenSchema } from "@server/lib/schemas";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;
  return json(await integrationsRepo.listTokens(id));
});

export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;
  const { name } = await parseBody(request, issueTokenSchema);

  const token = await integrationsRepo.issueToken({
    workspaceId, botId: id, name, createdBy: user.id,
  });
  await audit({
    actorId: user.id,
    action: "integration.token_issued",
    category: "user",
    severity: "warning",
    target: `${id} (${name})`,
    request,
  });
  return json({ token }, { status: 201 });
});
