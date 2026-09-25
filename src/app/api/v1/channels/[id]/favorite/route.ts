import { handler, noContent, parseBody } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { flagSchema } from "@server/lib/schemas";
import { channelsRepo } from "@server/repo/channels";

export const PUT = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  const body = await parseBody(request, flagSchema("isFavorite"));
  await channelsRepo.setFavorite(id, user.id, body.isFavorite);
  return noContent();
});
