import { handler, json } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { notificationsRepo } from "@server/repo/notifications";

export const GET = handler(async () => {
  const { user } = await requireSession();
  return json(await notificationsRepo.list(user.id));
});
