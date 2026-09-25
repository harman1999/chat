"use client";

import { Hash, Lock, MessageSquareReply } from "lucide-react";
import { UserAvatar } from "@/components/common";
import { MessageBody } from "@/components/messages/message-body";
import { Badge } from "@/components/ui/badge";
import { useUserMap } from "@/hooks";
import { formatRelative } from "@/lib/format";
import { useTimeFormatter } from "@/hooks";
import { cn } from "@/lib/utils";
import { useMessageStore } from "@/store";
import type { ThreadInboxEntry } from "@/services";

/** One row in the Threads view: the root, a preview of recent replies, unread state. */
export function ThreadCard({
  entry,
  onOpen,
}: {
  entry: ThreadInboxEntry;
  onOpen: () => void;
}) {
  const { thread, root, recentReplies, channel } = entry;
  const unreadReplyCount = useMessageStore(
    (state) => state.threadMetaByRootId[thread.rootId]?.unreadReplyCount ?? thread.unreadReplyCount,
  );
  const usersById = useUserMap();
  const rootAuthor = usersById[root.authorId];
  const formatTime = useTimeFormatter();
  const isChannel = channel.kind === "public" || channel.kind === "private";
  const Glyph = channel.kind === "private" ? Lock : Hash;
  const hasUnread = unreadReplyCount > 0;

  return (
    <article
      className={cn(
        "rounded-lg border bg-surface transition-colors",
        hasUnread ? "border-accent/35" : "border-border hover:border-border-strong",
      )}
    >
      <header className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-fg">
          {isChannel && <Glyph className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />}
          <span className="truncate">{channel.name}</span>
        </span>
        {thread.lastReplyAt && (
          <span className="ml-auto shrink-0 text-2xs text-fg-subtle">
            {formatRelative(thread.lastReplyAt)}
          </span>
        )}
        {hasUnread && (
          <Badge variant="accent" size="sm" className="tabular-nums">
            {unreadReplyCount} new
          </Badge>
        )}
      </header>

      <div className="px-3 py-2.5">
        <div className="flex gap-2.5">
          {rootAuthor && <UserAvatar user={rootAuthor} size="md" />}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-semibold text-fg">{rootAuthor?.displayName}</span>
              <time dateTime={root.createdAt} className="text-2xs tabular-nums text-fg-subtle">
                {formatTime(root.createdAt)}
              </time>
            </p>
            <MessageBody body={root.body} className="mt-0.5 line-clamp-2" />
          </div>
        </div>

        {recentReplies.length > 0 && (
          <ul className="mt-2.5 space-y-1.5 border-l-2 border-border pl-3">
            {recentReplies.map((reply) => {
              const author = usersById[reply.authorId];
              return (
                <li key={reply.id} className="flex items-baseline gap-1.5 text-xs">
                  <span className="shrink-0 font-medium text-fg-muted">{author?.displayName}</span>
                  <span className="min-w-0 truncate text-fg-subtle">{reply.body}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-border px-3 py-1.5">
        <span className="flex -space-x-1">
          {thread.participantIds
            .map((id) => usersById[id])
            .filter(Boolean)
            .slice(0, 4)
            .map((user) => (
              <UserAvatar key={user.id} user={user} size="xs" ringClassName="border-surface" />
            ))}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-subtle"
        >
          <MessageSquareReply className="size-3.5" aria-hidden />
          {thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}
        </button>
      </footer>
    </article>
  );
}
