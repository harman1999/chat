import { handler, noContent } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { threadsRepo } from "@server/repo/threads";

export const POST = handler(async (_request: Request, ctx: { params: Promise<{ rootId: string }> }) => {
  const { user } = await requireSession();
  const { rootId } = await ctx.params;
  await threadsRepo.markRead(rootId, user.id);
  return noContent();
});
