import { handler, noContent, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { publish } from "@server/lib/events";
import { requirePermission } from "@server/lib/permissions";
import { archiveSchema } from "@server/lib/schemas";
import { ForbiddenError, requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";

export const PUT = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  const { id } = await ctx.params;

  if (!(await channelsRepo.isMember(id, user.id))) {
    throw new ForbiddenError("You are not a member of this channel");
  }
  await requirePermission(user.id, "p_ch_archive");

  const channel = await channelsRepo.get(id, user.id, workspaceId);
  if (!channel) return problem(404, "not_found", "Channel not found");
  if (channel.kind === "dm" || channel.kind === "group_dm") {
    return problem(409, "not_archivable", "Direct messages cannot be archived");
  }

  const { isArchived } = await parseBody(request, archiveSchema);
  await channelsRepo.setArchived(id, isArchived);

  await publish("channel.membership", { channelId: id }, { channelId: id });
  await audit({
    actorId: user.id,
    action: isArchived ? "channel.archived" : "channel.unarchived",
    category: "channel",
    severity: "warning",
    target: `#${channel.name}`,
    request,
  });

  return noContent();
});
