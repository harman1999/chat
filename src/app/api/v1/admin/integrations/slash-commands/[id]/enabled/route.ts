import { handler, noContent, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { flagSchema } from "@server/lib/schemas";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

/** Disabling stops it working without discarding its history or its secret. */
export const PUT = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const { id } = await ctx.params;
  const { isEnabled } = await parseBody(request, flagSchema("isEnabled"));

  if (!(await integrationsRepo.setEnabled("command", id, workspaceId, isEnabled))) {
    return problem(404, "not_found", "Not found");
  }
  await audit({
    actorId: user.id,
    action: isEnabled ? "integration.slash_command_enabled" : "integration.slash_command_disabled",
    category: "system",
    severity: "warning",
    target: id,
    request,
  });
  return noContent();
});
