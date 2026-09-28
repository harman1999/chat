import { handler, json, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

/** Where members of a deleted role land: the least-privileged built-in role. */
const FALLBACK_ROLE = "role_member";

/**
 * Deletes a custom role.
 *
 * Its members are moved to Member in the same transaction rather than left
 * pointing at a role that no longer exists. The response says how many moved,
 * so the caller can report it — deleting a role silently changes what those
 * people can do.
 */
export const DELETE = handler(
  async (request: Request, ctx: { params: Promise<{ roleId: string }> }) => {
    const { user, workspaceId } = await requireSession();
    await requirePermission(user.id, "p_user_manage_roles");
    const { roleId } = await ctx.params;

    const result = await adminRepo.deleteRole({
      workspaceId,
      roleId,
      fallbackRoleId: FALLBACK_ROLE,
    });

    if (!result.ok) {
      switch (result.reason) {
        case "not_found":
          return problem(404, "not_found", "Role not found");
        case "system_role":
          return problem(409, "system_role", "Built-in roles cannot be deleted");
        case "bad_fallback":
          return problem(409, "bad_fallback", "Member is the fallback role and cannot be deleted");
      }
    }

    await audit({
      actorId: user.id,
      action: "role.deleted",
      category: "role",
      // Changes what real people can do, so it reads as critical in the log.
      severity: "critical",
      // Names, not just a count: this is the only record of who lost what.
      target:
        result.movedMembers > 0
          ? `${result.name} — moved to Member: ${result.movedUsernames.map((name) => `@${name}`).join(", ")}`
          : `${result.name} — nobody had it`,
      request,
    });

    return json({ movedMembers: result.movedMembers, movedTo: FALLBACK_ROLE });
  },
);
