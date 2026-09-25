import { handler, noContent, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { flagSchema } from "@server/lib/schemas";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

/** Deactivates rather than deletes: the bot authored messages that must stay. */
export const PUT = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;
  const { isActive } = await parseBody(request, flagSchema("isActive"));

  if (!(await integrationsRepo.setBotActive(id, workspaceId, isActive))) {
    return problem(404, "not_found", "Bot not found");
  }
  await audit({
    actorId: user.id,
    action: isActive ? "integration.bot_enabled" : "integration.bot_disabled",
    category: "user",
    severity: "warning",
    target: id,
    request,
  });
  return noContent();
});
