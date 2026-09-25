import { handler, noContent, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

export const DELETE = handler(
  async (request: Request, ctx: { params: Promise<{ tokenId: string }> }) => {
    const { user, workspaceId } = await requireSession();
    await requirePermission(user.id, "p_admin_settings");
    const { tokenId } = await ctx.params;

    if (!(await integrationsRepo.revokeToken(tokenId, workspaceId))) {
      return problem(404, "not_found", "Token not found or already revoked");
    }
    await audit({
      actorId: user.id,
      action: "integration.token_revoked",
      category: "user",
      severity: "warning",
      target: tokenId,
      request,
    });
    return noContent();
  },
);
