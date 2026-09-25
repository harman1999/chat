"use client";

import { Bell, BellOff, Hash, Loader2, Lock, MessagesSquare } from "lucide-react";
import { useEffect, useRef } from "react";
import { EmptyState, ErrorState } from "@/components/common";
import { MessageComposer } from "@/components/chat/composer/message-composer";
import { DayDivider } from "@/components/chat/day-divider";
import { MessageListSkeleton } from "@/components/chat/message-skeleton";
import { PanelHeader } from "@/components/layout/panel-header";
import { MessageItem } from "@/components/messages/message-item";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { useConversation, useThread } from "@/hooks";
import { cn } from "@/lib/utils";
import type { ID } from "@/types";

/**
 * Thread surface.
 *
 * Deliberately built from the same `MessageItem` and `MessageComposer` as the
 * channel — a thread should read as the same conversation continued, not as a
 * second application bolted onto the side.
 */
export function ThreadPanel({ rootId, onClose }: { rootId: ID; onClose?: () => void }) {
  const {
    root, replies, rows, isPending, isError, refetch,
    isFollowing, toggleFollowing, hasMore, isLoadingMore, loadMore,
  } = useThread(rootId);
  const { data: conversation } = useConversation(root?.channelId ?? "");

  const scrollRef = useRef<HTMLDivElement>(null);
  const replyCountRef = useRef(0);

  // Follow new replies, the same way the channel list does.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (replies.length > replyCountRef.current) {
      node.scrollTop = node.scrollHeight;
    }
    replyCountRef.current = replies.length;
  }, [replies.length]);

  const isChannel = conversation?.kind === "public" || conversation?.kind === "private";
  const Glyph = conversation?.kind === "private" ? Lock : Hash;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <PanelHeader
        title="Thread"
        subtitle={
          conversation ? (
            <span className="flex items-center gap-0.5">
              {isChannel && <Glyph className="size-2.5 shrink-0" aria-hidden />}
              <span className="truncate">{conversation.name}</span>
            </span>
          ) : undefined
        }
        onClose={onClose}
        actions={
          root && (
            <Hint label={isFollowing ? "Stop following this thread" : "Follow this thread"}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={isFollowing ? "Stop following this thread" : "Follow this thread"}
                aria-pressed={isFollowing}
                onClick={toggleFollowing}
                className={cn(isFollowing && "text-accent hover:text-accent")}
              >
                {isFollowing ? <Bell /> : <BellOff />}
              </Button>
            </Hint>
          )
        }
      />

      {isError ? (
        <ErrorState
          title="Thread could not be loaded"
          description="The replies are temporarily unavailable."
          onRetry={() => refetch()}
        />
      ) : isPending && !root ? (
        <MessageListSkeleton rows={4} />
      ) : !root ? (
        <EmptyState
          icon={MessagesSquare}
          title="Message unavailable"
          description="This message may have been deleted."
          compact
        />
      ) : (
        <>
          <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {/* Root message — always expanded, never grouped. */}
            <div className="pt-1">
              <MessageItem message={root} isGroupStart isGroupEnd variant="thread" />
            </div>

            <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
              <span className="h-px flex-1 bg-border" aria-hidden />
              <span className="text-2xs font-semibold text-fg-subtle">
                {replies.length === 0
                  ? "No replies yet"
                  : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
              </span>
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>

            {replies.length === 0 ? (
              <EmptyState
                icon={MessagesSquare}
                title="Start the thread"
                description="Replies stay out of the main channel unless you send them there too."
                compact
              />
            ) : (
              rows.map((row) => {
                if (row.type === "day") return <DayDivider key={row.key} timestamp={row.timestamp} />;
                if (row.type === "unread") return null;
                return (
                  <MessageItem
                    key={row.key}
                    message={row.message}
                    isGroupStart={row.isGroupStart}
                    isGroupEnd={row.isGroupEnd}
                    variant="thread"
                  />
                );
              })
            )}

            {hasMore && (
              <div className="flex justify-center py-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isLoadingMore}
                  onClick={() => void loadMore()}
                >
                  {isLoadingMore && <Loader2 className="animate-spin" />}
                  Load more replies
                </Button>
              </div>
            )}

            <div className="h-2" />
          </div>

          {conversation && (
            <MessageComposer conversation={conversation} threadRootId={rootId} autoFocus />
          )}
        </>
      )}
    </div>
  );
}
