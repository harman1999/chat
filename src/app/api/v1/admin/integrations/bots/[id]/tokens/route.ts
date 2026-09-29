import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { issueTokenSchema } from "@server/lib/schemas";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;
  if (!(await integrationsRepo.isBotOf(id, workspaceId))) return problem(404, "not_found", "Bot not found");
  return json(await integrationsRepo.listTokens(id, workspaceId));
});

export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;
  const { name } = await parseBody(request, issueTokenSchema);
  // Only for a bot, and only one of this workspace: a token for a person, or
  // for anyone elsewhere, would be a way to sign in as them.
  if (!(await integrationsRepo.isBotOf(id, workspaceId))) return problem(404, "not_found", "Bot not found");

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
