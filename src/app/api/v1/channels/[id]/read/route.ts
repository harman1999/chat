import { handler, noContent } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";

export const POST = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  await channelsRepo.markRead(id, user.id);
  return noContent();
});
