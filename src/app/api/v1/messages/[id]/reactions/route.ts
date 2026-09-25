import { handler, noContent, parseBody } from "@server/lib/http";
import { publish } from "@server/lib/events";
import { reactionSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { messagesRepo } from "@server/repo/messages";

export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  const body = await parseBody(request, reactionSchema);
  await messagesRepo.addReaction(id, user.id, body.emoji, body.name ?? body.emoji);
  const channelId = await messagesRepo.channelOf(id);
  await publish(
    "reaction.created",
    { messageId: id, emoji: body.emoji, name: body.name ?? body.emoji, userId: user.id },
    { channelId: channelId ?? undefined },
  );
  return noContent();
});
