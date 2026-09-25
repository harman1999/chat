import { handler, noContent } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { notificationsRepo } from "@server/repo/notifications";

export const POST = handler(async () => {
  const { user } = await requireSession();
  await notificationsRepo.markAllRead(user.id);
  return noContent();
});
