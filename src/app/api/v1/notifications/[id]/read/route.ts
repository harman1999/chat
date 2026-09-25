import { handler, noContent } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { notificationsRepo } from "@server/repo/notifications";

export const POST = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  await notificationsRepo.markRead(id, user.id);
  return noContent();
});
