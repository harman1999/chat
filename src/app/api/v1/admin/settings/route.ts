import { handler, json, noContent, parseBody } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { systemSettingsSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  return json(await adminRepo.settings(workspaceId));
});

export const PATCH = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  // Closed schema — same jsonb-merge reasoning as user preferences.
  const patch = await parseBody(request, systemSettingsSchema);
  await adminRepo.updateSettings(workspaceId, patch);
  await audit({
    actorId: user.id,
    action: "system.settings_updated",
    category: "system",
    severity: "critical",
    target: Object.keys(patch).join(", ") || "(no changes)",
    request,
  });
  return noContent();
});
