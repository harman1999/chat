import { handler, json, problem } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { usersRepo } from "@server/repo/users";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { workspaceId } = await requireSession();
  const { id } = await ctx.params;
  const user = await usersRepo.get(id, workspaceId);
  if (!user) return problem(404, "not_found", "User not found");
  return json(user);
});
