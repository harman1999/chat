import { handler, json, problem } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { threadsRepo } from "@server/repo/threads";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ rootId: string }> }) => {
  const { user } = await requireSession();
  const { rootId } = await ctx.params;
  const thread = await threadsRepo.get(rootId, user.id);
  if (!thread) return problem(404, "not_found", "Thread not found");
  return json(thread);
});
