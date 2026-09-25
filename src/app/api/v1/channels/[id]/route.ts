import { handler, json, problem } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  const { id } = await ctx.params;
  const channel = await channelsRepo.get(id, user.id, workspaceId);
  if (!channel) return problem(404, "not_found", "Channel not found");
  return json(channel);
});
