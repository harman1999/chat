import { handler, json, noContent, parseBody } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { systemSettingsSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";
import { defaultSettings, workspacesRepo } from "@server/repo/workspaces";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const [settings, identity] = await Promise.all([
    adminRepo.settings(workspaceId),
    workspacesRepo.identity(workspaceId),
  ]);
  // Defaults first, so a workspace missing a key still gets a whole object —
  // the settings page reads every field. The name is a column, not a setting:
  // it is what the switcher and every other screen show.
  return json({
    ...defaultSettings(identity?.slug ?? "workspace", null),
    ...settings,
    workspaceName: identity?.name ?? "",
  });
});

export const PATCH = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  // Closed schema — same jsonb-merge reasoning as user preferences.
  const { workspaceName, ...patch } = await parseBody(request, systemSettingsSchema);

  if (workspaceName !== undefined) {
    const previous = await workspacesRepo.name(workspaceId);
    if (previous !== workspaceName) {
      await workspacesRepo.rename(workspaceId, workspaceName);
      await audit({
        actorId: user.id,
        action: "workspace.renamed",
        category: "system",
        severity: "warning",
        target: `${previous ?? "?"} → ${workspaceName}`,
        request,
      });
    }
  }

  if (Object.keys(patch).length > 0) {
    await adminRepo.updateSettings(workspaceId, patch);
    await audit({
      actorId: user.id,
      action: "system.settings_updated",
      category: "system",
      severity: "critical",
      target: Object.keys(patch).join(", "),
      request,
    });
  }
  return noContent();
});
