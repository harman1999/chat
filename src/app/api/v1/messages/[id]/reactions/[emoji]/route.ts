import { handler, noContent } from "@server/lib/http";
import { publish } from "@server/lib/events";
import { requireSession } from "@server/lib/session";
import { messagesRepo } from "@server/repo/messages";

export const DELETE = handler(
  async (_request: Request, ctx: { params: Promise<{ id: string; emoji: string }> }) => {
    const { user } = await requireSession();
    const { id, emoji } = await ctx.params;
    const decoded = decodeURIComponent(emoji);

    await messagesRepo.removeReaction(id, user.id, decoded);
    const channelId = await messagesRepo.channelOf(id);
    await publish(
      "reaction.deleted",
      { messageId: id, emoji: decoded, name: decoded, userId: user.id },
      { channelId: channelId ?? undefined },
    );
    return noContent();
  },
);
