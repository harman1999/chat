import { handler, noContent, parseBody } from "@server/lib/http";
import { requireMessageAccess } from "@server/lib/access";
import { requireSession } from "@server/lib/session";
import { flagSchema } from "@server/lib/schemas";
import { threadsRepo } from "@server/repo/threads";

export const PUT = handler(async (request: Request, ctx: { params: Promise<{ rootId: string }> }) => {
  const { user } = await requireSession();
  const { rootId } = await ctx.params;
  await requireMessageAccess(rootId, user.id);
  const body = await parseBody(request, flagSchema("isFollowing"));
  await threadsRepo.setFollowing(rootId, user.id, body.isFollowing);
  return noContent();
});
