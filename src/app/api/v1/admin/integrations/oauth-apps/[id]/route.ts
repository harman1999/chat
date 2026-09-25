import { handler, noContent, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

/** Deleting the app cascades to its codes and tokens, revoking access. */
export const DELETE = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;

  if (!(await integrationsRepo.deleteApp(id, workspaceId))) {
    return problem(404, "not_found", "Application not found");
  }
  await audit({
    actorId: user.id,
    action: "integration.oauth_app_deleted",
    category: "system",
    severity: "critical",
    target: id,
    request,
  });
  return noContent();
});
