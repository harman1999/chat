import { handler, noContent, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

export const DELETE = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;

  if (!(await integrationsRepo.deleteConnection(id, workspaceId))) {
    return problem(404, "not_found", "Connection not found");
  }
  await audit({
    actorId: user.id,
    action: "integration.oauth_connection_deleted",
    category: "system",
    severity: "warning",
    target: id,
    request,
  });
  return noContent();
});
