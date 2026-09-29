import { handler, json, noContent, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { updateTeamSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { teamsRepo } from "@server/repo/teams";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const { user, workspaceId } = await requireSession();
  const { id } = await ctx.params;
  const team = await teamsRepo.get(workspaceId, id, user.id);
  if (!team) return problem(404, "not_found", "Team not found");
  return json(team);
});

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_team_manage");
  const { id } = await ctx.params;
  const patch = await parseBody(request, updateTeamSchema);

  const result = await teamsRepo.update(workspaceId, id, patch);
  if (result === "not_found") return problem(404, "not_found", "Team not found");
  if (result === "name_taken") return problem(409, "name_taken", `A team called “${patch.name}” already exists`);

  await audit({
    actorId: user.id,
    action: "team.updated",
    category: "channel",
    severity: "info",
    target: `${id}: ${Object.keys(patch).join(", ")}`,
    request,
  });
  return noContent();
});

/** Deletes the team. Its channels stay, as ordinary channels, with everyone still in them. */
export const DELETE = handler(async (request: Request, ctx: Ctx) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_team_manage");
  const { id } = await ctx.params;

  const team = await teamsRepo.get(workspaceId, id, user.id);
  if (!team || !(await teamsRepo.remove(workspaceId, id))) return problem(404, "not_found", "Team not found");

  await audit({
    actorId: user.id,
    action: "team.deleted",
    category: "channel",
    severity: "warning",
    target: `${team.name} (${team.memberCount} people, ${team.channelCount} channels kept)`,
    request,
  });
  return noContent();
});
