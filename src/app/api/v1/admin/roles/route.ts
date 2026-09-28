import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { createRoleSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  return json(await adminRepo.listRoles(workspaceId));
});

export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  const body = await parseBody(request, createRoleSchema);

  const result = await adminRepo.createRole({ workspaceId, ...body });
  if (!result.ok) {
    return result.reason === "name_taken"
      ? problem(409, "name_taken", `A role called "${body.name}" already exists`)
      : problem(422, "unknown_source", "The role to copy permissions from does not exist");
  }

  await audit({
    actorId: user.id,
    action: "role.created",
    category: "role",
    severity: "warning",
    target: body.copyFromRoleId ? `${body.name} (copied from ${body.copyFromRoleId})` : body.name,
    request,
  });

  const roles = await adminRepo.listRoles(workspaceId);
  return json(roles.find((role) => role.id === result.roleId), { status: 201 });
});
