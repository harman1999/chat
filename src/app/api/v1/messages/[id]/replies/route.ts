import { handler, json } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { messagesRepo } from "@server/repo/messages";

export const GET = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  const cursor = new URL(request.url).searchParams.get("cursor");
  return json(await messagesRepo.listReplies(id, user.id, cursor));
});
