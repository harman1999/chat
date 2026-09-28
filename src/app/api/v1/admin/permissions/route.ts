import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { permissionChangesSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

/** Editing the owner role could remove the last way to administer anything. */
const IMMUTABLE_ROLES = ["role_owner"];

export const GET = handler(async () => {
  const { user } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  return json(await adminRepo.listPermissions());
});

/**
 * Saves a batch of edits to the role × permission matrix, all or nothing.
 *
 * One request for one Save, so the confirmation can promise exactly what will
 * happen: either every listed change lands, or — if any is invalid — none do.
 */
export const PUT = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  const { changes } = await parseBody(request, permissionChangesSchema);

  const result = await adminRepo.applyPermissionChanges({
    workspaceId,
    changes,
    immutableRoleIds: IMMUTABLE_ROLES,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "immutable_role":
        return problem(403, "immutable_role", "The owner role cannot be changed");
      case "unknown_role":
        return problem(422, "unknown_role", `No such role: ${result.id}`);
      case "unknown_permission":
        return problem(422, "unknown_permission", `No such permission: ${result.id}`);
    }
  }

  // One entry per change, matching the single-toggle route, so the audit trail
  // reads the same however the change was made.
  for (const change of result.applied) {
    await audit({
      actorId: user.id,
      action: change.granted ? "role.permission_granted" : "role.permission_revoked",
      category: "role",
      severity: "critical",
      target: `${change.roleId} ${change.granted ? "+" : "−"} ${change.permissionId}`,
      request,
    });
  }

  return json({ applied: result.applied.length });
});
