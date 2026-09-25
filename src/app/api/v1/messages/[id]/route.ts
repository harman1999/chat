import { handler, json, noContent, parseBody, problem } from "@server/lib/http";
import { publish } from "@server/lib/events";
import { messageEditSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { messagesRepo } from "@server/repo/messages";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  const message = await messagesRepo.get(id, user.id);
  if (!message) return problem(404, "not_found", "Message not found");
  return json(message);
});

export const PATCH = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  const { body: text } = await parseBody(request, messageEditSchema);

  // Ownership is enforced in the UPDATE itself, so a miss means not yours.
  if (!(await messagesRepo.update(id, user.id, text))) {
    return problem(403, "forbidden", "You can only edit your own messages");
  }

  const updated = await messagesRepo.get(id, user.id);
  if (updated) await publish("message.updated", updated, { channelId: updated.channelId });
  return noContent();
});

export const DELETE = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  const channelId = await messagesRepo.channelOf(id);
  if (!(await messagesRepo.remove(id, user.id))) {
    return problem(403, "forbidden", "You can only delete your own messages");
  }
  await publish("message.deleted", { id }, { channelId: channelId ?? undefined });
  return noContent();
});
