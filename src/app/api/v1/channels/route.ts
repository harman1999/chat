import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { publish } from "@server/lib/events";
import { requirePermission } from "@server/lib/permissions";
import { createChannelSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";
import { teamsRepo } from "@server/repo/teams";

export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  const body = await parseBody(request, createChannelSchema);

  await requirePermission(
    user.id,
    body.kind === "private" ? "p_ch_create_private" : "p_ch_create_public",
  );

  // A channel inside a team is a team decision, not just a channel one.
  if (body.teamId) {
    await requirePermission(user.id, "p_team_manage");
    if (!(await teamsRepo.exists(workspaceId, body.teamId))) return problem(404, "not_found", "Team not found");
  }

  if (await channelsRepo.nameTaken(workspaceId, body.name)) {
    return problem(409, "name_taken", `#${body.name} already exists`);
  }

  const channel = await channelsRepo.create({
    workspaceId,
    kind: body.kind,
    name: body.name,
    purpose: body.purpose,
    createdBy: user.id,
    teamId: body.teamId,
  });
  if (!channel) return problem(500, "create_failed", "The channel could not be created");

  // The team's people, plus anyone named.
  const teamPeople = body.teamId ? await teamsRepo.memberIds(workspaceId, body.teamId) : [];
  const everyone = [...new Set([...(body.memberIds ?? []), ...teamPeople])];
  if (everyone.length) {
    const added = await channelsRepo.addMembers(channel.id, everyone);
    // New members must be told, or their sidebar will not show the channel
    // until they reload.
    if (added.length) await publish("channel.membership", { channelId: channel.id }, { userIds: added });
  }

  await audit({
    actorId: user.id,
    action: "channel.created",
    category: "channel",
    target: `#${channel.name}`,
    request,
  });

  return json(channel, { status: 201 });
});
