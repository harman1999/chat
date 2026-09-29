import { handler, json, problem } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  const { id } = await ctx.params;
  // Only your own workspace. The query is membership-scoped already; this
  // says so plainly instead of relying on it.
  if (id !== workspaceId) return problem(404, "not_found", "Workspace not found");
  return json(await channelsRepo.listDirectMessages(id, user.id));
});
