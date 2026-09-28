import { handler, noContent, problem } from "@server/lib/http";
import { queryOne } from "@server/db/client";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

type Ctx = { params: Promise<{ roleId: string; permissionId: string }> };

/**
 * The role must be in the caller's workspace — role ids are global, so without
 * that an administrator elsewhere could edit this workspace's roles. The owner
 * role is immutable: removing its permissions could lock everyone out.
 */
async function guard(workspaceId: string, roleId: string) {
  const role = await queryOne<{ kind: string | null }>(
    `SELECT kind FROM roles WHERE id = $1 AND workspace_id = $2`,
    [roleId, workspaceId],
  );
  if (!role) return problem(404, "not_found", "Role not found");
  if (role.kind === "owner") return problem(403, "forbidden", "The owner role cannot be changed");
  return null;
}

export const PUT = handler(async (_request: Request, ctx: Ctx) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  const { roleId, permissionId } = await ctx.params;

  const blocked = await guard(workspaceId, roleId);
  if (blocked) return blocked;

  await adminRepo.setRolePermission(roleId, permissionId, true);
  await audit({
    actorId: user.id,
    action: "role.permission_granted",
    category: "role",
    severity: "critical",
    target: `${roleId} + ${permissionId}`,
  });
  return noContent();
});

export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  const { roleId, permissionId } = await ctx.params;

  const blocked = await guard(workspaceId, roleId);
  if (blocked) return blocked;

  await adminRepo.setRolePermission(roleId, permissionId, false);
  await audit({
    actorId: user.id,
    action: "role.permission_revoked",
    category: "role",
    severity: "critical",
    target: `${roleId} − ${permissionId}`,
  });
  return noContent();
});
