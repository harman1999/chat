import { handler, noContent, parseBody, problem } from "@server/lib/http";
import { flagSchema } from "@server/lib/schemas";
import { ForbiddenError, requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";
import { messagesRepo } from "@server/repo/messages";

export const PUT = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  const body = await parseBody(request, flagSchema("isPinned"));

  // Pinning is a channel-visible act, so it needs the same membership check the
  // message endpoints use — without it any signed-in user could pin a message
  // in a private channel they cannot even read.
  const channelId = await messagesRepo.channelOf(id);
  if (!channelId) return problem(404, "not_found", "Message not found");
  if (!(await channelsRepo.isMember(channelId, user.id))) {
    throw new ForbiddenError("You are not a member of this channel");
  }

  await messagesRepo.setPinned(id, body.isPinned);
  return noContent();
});
