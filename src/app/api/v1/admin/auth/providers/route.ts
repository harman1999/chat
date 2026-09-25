import { handler, json } from "@server/lib/http";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { authProviders } from "@/config";

/**
 * Identity-provider configuration is not in Postgres — it belongs in secret
 * storage alongside the signing keys. Served from config until that lands.
 */
export const GET = handler(async () => {
  const { user } = await requireSession();
  await requirePermission(user.id, "p_admin_auth");
  return json(authProviders);
});
