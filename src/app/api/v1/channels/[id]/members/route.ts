import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { publish } from "@server/lib/events";
import { addMembersSchema } from "@server/lib/schemas";
import { ForbiddenError, requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  if (!(await channelsRepo.isMember(id, user.id))) {
    throw new ForbiddenError("You are not a member of this channel");
  }
  const members = await channelsRepo.members(id);
  return members.length ? json(members) : problem(404, "not_found", "Channel not found");
});

export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  const { id } = await ctx.params;

  // Only a member can add others — otherwise anyone could join a private
  // channel by adding themselves to it.
  if (!(await channelsRepo.isMember(id, user.id))) {
    throw new ForbiddenError("You are not a member of this channel");
  }

  const channel = await channelsRepo.get(id, user.id, workspaceId);
  if (!channel) return problem(404, "not_found", "Channel not found");
  if (channel.isArchived) {
    return problem(409, "channel_archived", "This channel is archived");
  }

  const { userIds } = await parseBody(request, addMembersSchema);
  const added = await channelsRepo.addMembers(id, userIds);

  if (added.length) {
    await publish("channel.membership", { channelId: id }, { userIds: added });
    await audit({
      actorId: user.id,
      action: "channel.members_added",
      category: "channel",
      target: `#${channel.name} +${added.length}`,
      request,
    });
  }

  return json({ added });
});
