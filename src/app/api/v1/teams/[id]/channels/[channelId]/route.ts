import { handler, noContent, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { publish } from "@server/lib/events";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { teamsRepo } from "@server/repo/teams";

type Ctx = { params: Promise<{ id: string; channelId: string }> };

/** Puts an existing channel in the team, and the team's people in the channel. */
export const PUT = handler(async (request: Request, ctx: Ctx) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_team_manage");
  const { id, channelId } = await ctx.params;

  const result = await teamsRepo.attachChannel(workspaceId, id, channelId);
  if (!result.ok) return problem(404, "not_found", "Team or channel not found");

  if (result.addedUserIds.length) {
    await publish("channel.membership", { channelId }, { userIds: result.addedUserIds });
  }
  await audit({
    actorId: user.id,
    action: "team.channel_added",
    category: "channel",
    severity: "info",
    target: `${channelId} to ${id} (${result.addedUserIds.length} people added)`,
    request,
  });
  return noContent();
});

/** Takes a channel out of the team. Everyone in it stays; only the grouping goes. */
export const DELETE = handler(async (request: Request, ctx: Ctx) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_team_manage");
  const { id, channelId } = await ctx.params;

  if (!(await teamsRepo.detachChannel(workspaceId, id, channelId))) {
    return problem(404, "not_found", "That channel is not in this team");
  }
  await audit({
    actorId: user.id,
    action: "team.channel_removed",
    category: "channel",
    severity: "info",
    target: `${channelId} from ${id}`,
    request,
  });
  return noContent();
});
