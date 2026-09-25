import { handler, noContent, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { publish } from "@server/lib/events";
import { requirePermission } from "@server/lib/permissions";
import { ForbiddenError, requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** `me` removes the caller — leaving a channel. Anyone else needs permission. */
export const DELETE = handler(async (request: Request, ctx: Ctx) => {
  const { user, workspaceId } = await requireSession();
  const { id, userId } = await ctx.params;
  const target = userId === "me" ? user.id : userId;

  if (!(await channelsRepo.isMember(id, user.id))) {
    throw new ForbiddenError("You are not a member of this channel");
  }
  if (target !== user.id) {
    await requirePermission(user.id, "p_ch_manage_members");
  }

  const channel = await channelsRepo.get(id, user.id, workspaceId);
  if (!(await channelsRepo.removeMember(id, target))) {
    return problem(404, "not_found", "That person is not in this channel");
  }

  await publish("channel.membership", { channelId: id }, { userIds: [target] });
  await audit({
    actorId: user.id,
    action: target === user.id ? "channel.left" : "channel.member_removed",
    category: "channel",
    target: `#${channel?.name ?? id}${target === user.id ? "" : ` -${target}`}`,
    request,
  });

  return noContent();
});
