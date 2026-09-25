import { handler, json } from "@server/lib/http";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

export const GET = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const days = Math.min(Number(new URL(request.url).searchParams.get("days") ?? 30) || 30, 90);
  return json(await adminRepo.activity(workspaceId, days));
});
