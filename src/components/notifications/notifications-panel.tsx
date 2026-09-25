"use client";

import { BellOff, CheckCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJumpToMessage, useNotifications } from "@/hooks";
import { cn } from "@/lib/utils";
import type { NotificationKind } from "@/types";
import { NotificationItem } from "./notification-item";

const TABS: { value: "all" | "unread" | NotificationKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "mention", label: "Mentions" },
  { value: "direct_message", label: "DMs" },
  { value: "thread_reply", label: "Threads" },
];

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { data, isPending, unreadCount, markRead, markAllRead } = useNotifications();
  const jumpToMessage = useJumpToMessage();
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("all");

  const visible = useMemo(() => {
    if (!data) return [];
    if (tab === "all") return data;
    if (tab === "unread") return data.filter((item) => !item.isRead);
    return data.filter((item) => item.kind === tab);
  }, [data, tab]);

  return (
    <div className="flex max-h-[min(32rem,75vh)] w-[min(24rem,calc(100vw-2rem))] flex-col">
      <header className="flex items-center gap-1 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">Notifications</p>
          <p className="text-2xs text-fg-subtle">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => markAllRead()}>
            <CheckCheck />
            Mark all read
          </Button>
        )}

      </header>

      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        {TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={tab === option.value}
            onClick={() => setTab(option.value)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              tab === option.value
                ? "bg-accent-subtle text-accent-subtle-fg"
                : "text-fg-muted hover:bg-surface-hover hover:text-fg",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-1.5">
        {isPending ? (
          <div className="space-y-2 p-1" aria-hidden>
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex gap-2.5">
                <Skeleton className="size-8 shrink-0 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-32 rounded-full" />
                  <Skeleton className="h-2.5 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={tab === "unread" ? "Nothing unread" : "No notifications"}
            description="Mentions, direct messages and thread replies land here."
            compact
          />
        ) : (
          visible.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onSelect={() => {
                markRead(notification.id);
                if (notification.channelId) {
                  jumpToMessage(notification.channelId, notification.messageId);
                }
                onClose();
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
