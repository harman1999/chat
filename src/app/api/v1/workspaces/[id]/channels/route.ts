import { handler, json } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  return json(await channelsRepo.listChannels(id, user.id));
});
