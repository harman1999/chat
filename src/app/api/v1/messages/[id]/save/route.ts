import { handler, noContent, parseBody } from "@server/lib/http";
import { requireMessageAccess } from "@server/lib/access";
import { requireSession } from "@server/lib/session";
import { flagSchema } from "@server/lib/schemas";
import { messagesRepo } from "@server/repo/messages";

export const PUT = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  await requireMessageAccess(id, user.id);
  const body = await parseBody(request, flagSchema("isSaved"));
  await messagesRepo.setSaved(id, user.id, body.isSaved);
  return noContent();
});
