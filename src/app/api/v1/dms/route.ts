import { handler, json, parseBody, problem } from "@server/lib/http";
import { openDirectMessageSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";

/**
 * Opens a direct message with someone.
 *
 * "Open" rather than "create": asking twice returns the same conversation.
 * Anything else would split a history in two the moment both people start one
 * at once.
 *
 * Opening one with yourself is allowed: a private space for drafts, links and
 * reminders, visible to nobody else.
 */
export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  const { userId } = await parseBody(request, openDirectMessageSchema);

  const conversation = await channelsRepo.openDirect(workspaceId, user.id, userId);
  if (!conversation) {
    // Covers an unknown id, someone in another workspace, and a deactivated
    // account — all of which are "no such person to talk to" from here.
    return problem(404, "not_found", "That person is not available in this workspace");
  }

  return json(conversation, { status: 200 });
});
