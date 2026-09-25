import { handler, noContent, problem } from "@server/lib/http";
import { queryOne } from "@server/db/client";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

type Ctx = { params: Promise<{ roleId: string; permissionId: string }> };

/** The owner role is immutable — removing its permissions could lock everyone out. */
async function guard(roleId: string) {
  if (roleId === "role_owner") return problem(403, "forbidden", "The owner role cannot be changed");
  const role = await queryOne<{ id: string }>(`SELECT id FROM roles WHERE id = $1`, [roleId]);
  if (!role) return problem(404, "not_found", "Role not found");
  return null;
}

export const PUT = handler(async (_request: Request, ctx: Ctx) => {
  const { user } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  const { roleId, permissionId } = await ctx.params;

  const blocked = await guard(roleId);
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
  const { user } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  const { roleId, permissionId } = await ctx.params;

  const blocked = await guard(roleId);
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
