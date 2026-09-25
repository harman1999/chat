import { handler, json } from "@server/lib/http";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  return json(await adminRepo.storage(workspaceId));
});
