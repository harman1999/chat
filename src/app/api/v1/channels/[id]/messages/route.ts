import { handler, json, parseBody, problem } from "@server/lib/http";
import { dispatchOutgoing } from "@server/lib/dispatch";
import { publish } from "@server/lib/events";
import { messageBodySchema } from "@server/lib/schemas";
import { ForbiddenError, requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";
import { messagesRepo } from "@server/repo/messages";
import { notificationsRepo } from "@server/repo/notifications";
import { threadsRepo } from "@server/repo/threads";

/** Usernames the body mentions; ids are resolved server-side, never trusted. */
function mentionedUsernames(body: string): string[] {
  return [...body.matchAll(/(?:^|\s)@([a-z0-9._-]+)/gi)].map((match) => match[1].toLowerCase());
}

export const GET = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  if (!(await channelsRepo.isMember(id, user.id))) {
    throw new ForbiddenError("You are not a member of this channel");
  }
  const cursor = new URL(request.url).searchParams.get("cursor");
  return json(await messagesRepo.list(id, user.id, cursor));
});

export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireSession();
  const { id } = await ctx.params;
  if (!(await channelsRepo.isMember(id, user.id))) {
    throw new ForbiddenError("You are not a member of this channel");
  }

  const body = await parseBody(request, messageBodySchema);
  const text = body.body.trim();
  if (!text && !body.attachmentIds?.length) {
    return problem(400, "invalid_request", "A message needs text or an attachment");
  }

  const message = await messagesRepo.create({
    channelId: id,
    authorId: user.id,
    body: text,
    threadRootId: body.threadRootId ?? null,
    attachmentIds: body.attachmentIds,
    mentionedUsernames: mentionedUsernames(text),
  });

  if (message.threadRootId) await threadsRepo.ensureFollowing(message.threadRootId, user.id);

  await publish("message.created", message, { channelId: id });

  // Notify the people mentioned; broader channel notifications are a
  // per-member preference and belong in a worker, not the request path.
  if (message.mentionedUserIds.length > 0) {
    const created = await notificationsRepo.createForMessage({
      kind: "mention",
      userIds: message.mentionedUserIds,
      actorId: user.id,
      channelId: id,
      messageId: message.id,
      title: `${user.displayName} mentioned you`,
      preview: text.slice(0, 160),
    });
    for (const { userId, notification } of created) {
      await publish("notification.created", notification, { userIds: [userId] });
    }
  }

  // Detached on purpose: a slow external endpoint must not hold up the sender.
  const channel = await channelsRepo.get(id, user.id, workspaceId);
  dispatchOutgoing({
    workspaceId,
    message,
    author: user,
    channelName: channel?.name ?? "",
  });

  return json(message, { status: 201 });
});
