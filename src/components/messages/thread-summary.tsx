"use client";

import { ChevronRight } from "lucide-react";
import { UserAvatar } from "@/components/common";
import { useUserMap } from "@/hooks";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMessageStore } from "@/store";
import type { Message } from "@/types";

/** Inline thread affordance shown beneath a message that has replies. */
export function ThreadSummary({ message, onOpen }: { message: Message; onOpen: () => void }) {
  const usersById = useUserMap();
  const unreadReplyCount = useMessageStore(
    (state) => state.threadMetaByRootId[message.id]?.unreadReplyCount ?? 0,
  );

  if (message.replyCount === 0) return null;

  const participants = message.replyParticipantIds
    .map((id) => usersById[id])
    .filter(Boolean)
    .slice(0, 4);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View thread, ${message.replyCount} replies${unreadReplyCount ? `, ${unreadReplyCount} unread` : ""}`}
      className={cn(
        "group/thread mt-1 flex w-fit max-w-full items-center gap-2 rounded-md border py-0.5 pl-0.5 pr-1.5 text-left transition-colors",
        unreadReplyCount > 0
          ? "border-accent/35 bg-accent-subtle/60 hover:border-accent/55"
          : "border-transparent hover:border-border hover:bg-surface-subtle",
      )}
    >
      <span className="flex -space-x-1">
        {participants.map((user) => (
          <UserAvatar key={user.id} user={user} size="xs" ringClassName="border-surface" />
        ))}
      </span>
      <span className="text-xs font-semibold text-accent">
        {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
      </span>
      {unreadReplyCount > 0 && (
        <span className="rounded-full bg-accent px-1.5 text-[0.625rem] font-bold leading-4 text-accent-fg tabular-nums">
          {unreadReplyCount} new
        </span>
      )}
      {message.lastReplyAt && (
        <span className="truncate text-2xs text-fg-subtle group-hover/thread:hidden">
          Last reply {formatRelative(message.lastReplyAt)}
        </span>
      )}
      <span className="hidden items-center gap-0.5 text-2xs text-fg-muted group-hover/thread:flex">
        View thread
        <ChevronRight className="size-3" aria-hidden />
      </span>
    </button>
  );
}
