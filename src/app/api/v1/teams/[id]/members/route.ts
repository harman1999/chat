import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { publish } from "@server/lib/events";
import { requirePermission } from "@server/lib/permissions";
import { addTeamMembersSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { teamsRepo } from "@server/repo/teams";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const { workspaceId } = await requireSession();
  const { id } = await ctx.params;
  if (!(await teamsRepo.exists(workspaceId, id))) return problem(404, "not_found", "Team not found");
  return json(await teamsRepo.members(workspaceId, id));
});

/** Adds people to the team, and so to every channel it has. */
export const POST = handler(async (request: Request, ctx: Ctx) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_team_manage");
  const { id } = await ctx.params;
  const { userIds } = await parseBody(request, addTeamMembersSchema);

  const added = await teamsRepo.addMembers(workspaceId, id, userIds);
  if (!added) return problem(404, "not_found", "Team not found");

  // They now have channels they did not; their sidebars must be told.
  if (added.length) await publish("channel.membership", { teamId: id }, { userIds: added });
  await audit({
    actorId: user.id,
    action: "team.members_added",
    category: "user",
    severity: "info",
    target: `${id}: ${added.length} added`,
    request,
  });
  return json({ added });
});
