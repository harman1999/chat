import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { createUserSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";
import { usersRepo } from "@server/repo/users";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  return json(await adminRepo.listUsers(workspaceId));
});

/**
 * Creates an account directly.
 *
 * Not an invitation: there is no mail transport here, so the administrator sets
 * the first password and passes it on out of band. The distinction is kept
 * honest in the copy rather than papered over with the word "invite".
 */
export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_user_invite");

  const body = await parseBody(request, createUserSchema);
  const result = await usersRepo.create({ workspaceId, ...body });

  if (!result.ok) {
    // 409 for a collision with an existing row, 422 for a value that names
    // something which does not exist.
    switch (result.reason) {
      case "email_taken":
        return problem(409, "email_taken", "Someone in this workspace already uses that address");
      case "username_taken":
        return problem(409, "username_taken", `The username @${result.username} is taken`);
      case "unknown_role":
        return problem(422, "unknown_role", "That role does not exist in this workspace");
      case "unknown_channels":
        return problem(
          422,
          "unknown_channels",
          `No public channel named: ${result.names.join(", ")}`,
        );
    }
  }

  await audit({
    actorId: user.id,
    action: "user.created",
    category: "user",
    severity: "warning",
    target: `${result.user.email} (${body.roleId ?? "role_member"})`,
    request,
  });

  // The password is never echoed back, not even to the administrator who set it.
  return json(result.user, { status: 201 });
});
