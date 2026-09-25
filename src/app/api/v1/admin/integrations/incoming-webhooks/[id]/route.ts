import { handler, noContent, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

export const DELETE = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;

  if (!(await integrationsRepo.deleteIncoming(id, workspaceId))) {
    return problem(404, "not_found", "Webhook not found");
  }
  await audit({
    actorId: user.id,
    action: "integration.incoming_webhook_deleted",
    category: "channel",
    severity: "warning",
    target: id,
    request,
  });
  return noContent();
});
