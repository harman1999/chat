"use client";

import { UserAvatar } from "@/components/common";
import { useUser } from "@/hooks";
import { formatDayDivider } from "@/lib/format";
import { useTimeFormatter } from "@/hooks";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import { MessageBody } from "./message-body";

/**
 * Condensed message card used in panels — pinned lists, search results and
 * saved items — where a full message row would be too heavy.
 */
export function MessagePreview({
  message,
  onOpen,
  className,
}: {
  message: Message;
  onOpen?: () => void;
  className?: string;
}) {
  const author = useUser(message.authorId);
  const formatTime = useTimeFormatter();

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "block w-full rounded-md border border-border bg-surface p-2 text-left transition-colors",
        "hover:border-border-strong hover:bg-surface-hover",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        {author && <UserAvatar user={author} size="xs" />}
        <span className="truncate text-xs font-semibold text-fg">{author?.displayName}</span>
        <span className="shrink-0 text-[0.625rem] tabular-nums text-fg-subtle">
          {formatDayDivider(message.createdAt)} · {formatTime(message.createdAt)}
        </span>
      </span>
      <span className="mt-1 block line-clamp-3 text-xs leading-relaxed text-fg-muted">
        <MessageBody body={message.body} className="text-xs" />
      </span>
    </button>
  );
}
