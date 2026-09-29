import { handler, json, problem } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { teamsRepo } from "@server/repo/teams";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { workspaceId } = await requireSession();
  const { id } = await ctx.params;
  if (!(await teamsRepo.exists(workspaceId, id))) return problem(404, "not_found", "Team not found");
  return json(await teamsRepo.channels(workspaceId, id));
});
