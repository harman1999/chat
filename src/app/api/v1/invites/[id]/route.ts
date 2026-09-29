import { handler, noContent, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { requireUserSession } from "@server/lib/session";
import { invitesRepo } from "@server/repo/invites";

/** Revoking stops the link working at once, for anyone who already has it. */
export const DELETE = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireUserSession();
  await requirePermission(user.id, "p_user_invite");
  const { id } = await ctx.params;

  if (!(await invitesRepo.revoke(id, workspaceId))) {
    return problem(404, "not_found", "Invite link not found or already revoked");
  }
  await audit({
    actorId: user.id,
    action: "invite.link_revoked",
    category: "user",
    severity: "warning",
    target: id,
    request,
  });
  return noContent();
});
