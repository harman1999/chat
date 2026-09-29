import { handler, json, problem } from "@server/lib/http";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { countDue } from "@server/jobs/retention";

/**
 * How many messages a retention period would delete if it were set now.
 *
 * Read-only: the settings page shows this and asks for confirmation before
 * saving, since the deletion that follows is permanent.
 */
export const GET = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const days = Number(new URL(request.url).searchParams.get("days"));
  if (!Number.isInteger(days) || days < 30 || days > 36_500) {
    return problem(400, "invalid_request", "days must be a whole number from 30 to 36500");
  }
  return json({ days, messages: await countDue(workspaceId, days) });
});
