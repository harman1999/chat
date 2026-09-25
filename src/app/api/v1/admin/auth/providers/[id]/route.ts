import { handler, noContent } from "@server/lib/http";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";

export const PATCH = handler(async () => {
  const { user } = await requireSession();
  await requirePermission(user.id, "p_admin_auth");
  // No-op until provider config moves out of the repository.
  return noContent();
});
