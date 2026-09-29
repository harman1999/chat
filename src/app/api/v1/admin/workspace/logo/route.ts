import { handler, json, noContent, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { UPLOAD_RULE } from "@server/lib/rate-limit";
import { requireSession } from "@server/lib/session";
import { MAX_LOGO_BYTES, sniffLogo, workspacesRepo } from "@server/repo/workspaces";

const TOO_LARGE = "Logos must be 1 MB or smaller";

/** Replaces the workspace logo. The body is the image itself. */
export const PUT = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");

  // Refuse on the declared length before buffering, then check what arrived.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_LOGO_BYTES) {
    return problem(413, "file_too_large", TOO_LARGE);
  }
  const data = Buffer.from(await request.arrayBuffer());
  if (data.byteLength === 0) return problem(400, "empty_file", "Choose an image to upload");
  if (data.byteLength > MAX_LOGO_BYTES) return problem(413, "file_too_large", TOO_LARGE);

  const mime = sniffLogo(data);
  if (!mime) {
    return problem(415, "unsupported_image", "Use a PNG, JPEG or WebP image");
  }

  const logoUrl = await workspacesRepo.setLogo(workspaceId, data, mime);
  await audit({
    actorId: user.id,
    action: "workspace.logo_changed",
    category: "system",
    severity: "info",
    target: `${mime}, ${Math.ceil(data.byteLength / 1024)} KB`,
    request,
  });
  return json({ logoUrl });
}, { rateLimit: UPLOAD_RULE });

/** Removes the logo; the workspace falls back to the default mark. */
export const DELETE = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  if (await workspacesRepo.clearLogo(workspaceId)) {
    await audit({
      actorId: user.id,
      action: "workspace.logo_removed",
      category: "system",
      severity: "info",
      target: "workspace logo",
      request,
    });
  }
  return noContent();
});
