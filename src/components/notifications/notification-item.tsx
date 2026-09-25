"use client";

import { AtSign, Bot, Hash, MessageSquare, MessagesSquare, type LucideIcon } from "lucide-react";
import { UserAvatar } from "@/components/common";
import { useConversationMap, useUser } from "@/hooks";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationKind } from "@/types";

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  mention: AtSign,
  direct_message: MessageSquare,
  thread_reply: MessagesSquare,
  channel_message: Hash,
  system: Bot,
};

const KIND_TONE: Record<NotificationKind, string> = {
  mention: "bg-warning-subtle text-warning",
  direct_message: "bg-accent-subtle text-accent-subtle-fg",
  thread_reply: "bg-success-subtle text-success",
  channel_message: "bg-surface-active text-fg-muted",
  system: "bg-surface-active text-fg-muted",
};

export function NotificationItem({
  notification,
  onSelect,
}: {
  notification: AppNotification;
  onSelect: () => void;
}) {
  const actor = useUser(notification.actorId);
  const conversations = useConversationMap();
  const conversation = notification.channelId ? conversations[notification.channelId] : null;
  const Icon = KIND_ICON[notification.kind];

  const contextLabel = conversation
    ? conversation.kind === "public" || conversation.kind === "private"
      ? `#${conversation.name}`
      : conversation.name
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-hover",
        !notification.isRead && "bg-accent-subtle/40",
      )}
    >
      <span className="relative shrink-0 pt-0.5">
        {actor && <UserAvatar user={actor} size="md" />}
        <span
          className={cn(
            "absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full ring-2 ring-surface-raised",
            KIND_TONE[notification.kind],
          )}
          aria-hidden
        >
          <Icon className="size-2.5" />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-xs font-semibold text-fg">{notification.title}</span>
          <time
            dateTime={notification.createdAt}
            className="ml-auto shrink-0 text-2xs tabular-nums text-fg-subtle"
          >
            {formatRelative(notification.createdAt)}
          </time>
        </span>
        <span className="mt-0.5 block line-clamp-2 text-xs leading-relaxed text-fg-muted">
          {notification.preview}
        </span>
        {contextLabel && (
          <span className="mt-1 block truncate text-2xs text-fg-subtle">in {contextLabel}</span>
        )}
      </span>

      {!notification.isRead && (
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />
      )}
    </button>
  );
}
