import { handler, json } from "@server/lib/http";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_user_manage_roles");
  return json(await adminRepo.listRoles(workspaceId));
});
