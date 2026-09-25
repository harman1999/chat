import { handler, noContent, parseBody, problem } from "@server/lib/http";
import { queryOne } from "@server/db/client";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { roleAssignmentSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

export const PUT = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  const { id } = await ctx.params;
  const { roleId } = await parseBody(request, roleAssignmentSchema);

  // users.role_id carries no foreign key, so an unknown id would otherwise be
  // written silently and leave the account with a dangling role.
  const role = await queryOne<{ id: string }>(
    `SELECT id FROM roles WHERE id = $1 AND workspace_id = $2`,
    [roleId, workspaceId],
  );
  if (!role) return problem(422, "unknown_role", "That role does not exist in this workspace");

  const target = await queryOne<{ id: string }>(`SELECT id FROM users WHERE id = $1`, [id]);
  if (!target) return problem(404, "not_found", "User not found");

  await adminRepo.setUserRole(id, roleId);
  await audit({
    actorId: user.id,
    action: "user.role_changed",
    category: "role",
    severity: "warning",
    target: `${id} → ${roleId}`,
    request,
  });
  return noContent();
});
