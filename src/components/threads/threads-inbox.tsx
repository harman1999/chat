"use client";

import { CheckCheck, MessagesSquare } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useThreadInbox, useThreadUnreadTotal } from "@/hooks";
import { useMessageStore, useUIStore, useWorkspaceStore } from "@/store";
import { threadService } from "@/services";
import { ThreadCard } from "./thread-card";

function InboxSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-2 rounded-lg border border-border bg-surface p-3">
          <Skeleton className="h-2.5 w-24 rounded-full" />
          <div className="flex gap-2.5">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-2.5 w-28 rounded-full" />
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The Threads view — every thread the user follows, newest reply first.
 * This is where thread notifications land; the bell in the top bar stays for
 * mentions and DMs.
 */
export function ThreadsInbox() {
  const { data, isPending, isError, refetch } = useThreadInbox();
  const unreadTotal = useThreadUnreadTotal();
  const openThread = useUIStore((state) => state.openThread);
  const setActiveConversation = useWorkspaceStore((state) => state.setActiveConversation);
  const markThreadRead = useMessageStore((state) => state.markThreadRead);

  const open = (channelId: string, rootId: string) => {
    setActiveConversation(channelId, { keepSection: true });
    openThread(rootId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-md font-semibold tracking-tight text-fg">Threads</h1>
          <p className="truncate text-2xs text-fg-subtle">
            {unreadTotal > 0
              ? `${unreadTotal} unread ${unreadTotal === 1 ? "reply" : "replies"}`
              : "Threads you follow"}
          </p>
        </div>
        {unreadTotal > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              data?.forEach((entry) => {
                markThreadRead(entry.thread.rootId);
                void threadService.markRead(entry.thread.rootId);
              });
            }}
          >
            <CheckCheck />
            Mark all read
          </Button>
        )}
      </header>

      <ScrollArea className="min-h-0 flex-1">
        {isPending ? (
          <InboxSkeleton />
        ) : isError ? (
          <ErrorState
            title="Threads could not be loaded"
            description="Your followed threads are temporarily unavailable."
            onRetry={() => refetch()}
          />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="No threads yet"
            description="Reply to a message, or follow a thread, and it will show up here."
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
            {data.map((entry) => (
              <ThreadCard
                key={entry.thread.rootId}
                entry={entry}
                onOpen={() => open(entry.channel.id, entry.thread.rootId)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
