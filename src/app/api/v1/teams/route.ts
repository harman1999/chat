import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { publish } from "@server/lib/events";
import { requirePermission } from "@server/lib/permissions";
import { createTeamSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { teamsRepo } from "@server/repo/teams";

/** Every team in the workspace, marking the ones the caller is in. */
export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  return json(await teamsRepo.list(workspaceId, user.id));
});

/** Creates a team, optionally with its first people. Owners and administrators only. */
export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_team_manage");
  const body = await parseBody(request, createTeamSchema);

  const created = await teamsRepo.create({
    workspaceId,
    name: body.name,
    description: body.description,
    createdBy: user.id,
  });
  if (!created.ok) return problem(409, "name_taken", `A team called “${body.name}” already exists`);

  if (body.memberIds?.length) {
    const added = await teamsRepo.addMembers(workspaceId, created.teamId, body.memberIds);
    if (added?.length) await publish("channel.membership", { teamId: created.teamId }, { userIds: added });
  }

  await audit({
    actorId: user.id,
    action: "team.created",
    category: "channel",
    severity: "info",
    target: body.name,
    request,
  });
  return json(await teamsRepo.get(workspaceId, created.teamId, user.id), { status: 201 });
});
