"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Loader2, MessagesSquare } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { MessageItem } from "@/components/messages/message-item";
import { useMessages } from "@/hooks";
import { useUIStore } from "@/store";
import { cn } from "@/lib/utils";
import type { Channel } from "@/types";
import { ChannelIntro } from "./channel-intro";
import { DayDivider, UnreadDivider } from "./day-divider";
import { MessageListSkeleton } from "./message-skeleton";

/** Treat "within this many px of the bottom" as pinned to the latest message. */
const BOTTOM_THRESHOLD = 120;

/** How many extra pages to pull while hunting for a jump target. */
const JUMP_MAX_PAGES = 6;

export function MessageList({ conversation }: { conversation: Channel }) {
  const channelId = conversation.id;
  const { rows, messages, isPending, isError, refetch, hasMore, isLoadingOlder, loadOlder } =
    useMessages(channelId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  /** Scroll metrics captured before a prepend, so position can be restored. */
  const restoreRef = useRef<{ height: number; top: number } | null>(null);
  const messageCountRef = useRef(0);
  const channelRef = useRef(channelId);

  const highlightedMessageId = useUIStore((state) => state.highlightedMessageId);
  const setHighlightedMessage = useUIStore((state) => state.setHighlightedMessage);
  /** Suppresses bottom-pinning while a jump is in progress. */
  const isJumpingRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    setIsAtBottom(distance <= BOTTOM_THRESHOLD);
  }, []);

  // Jump to the latest message when the conversation changes.
  useLayoutEffect(() => {
    if (channelRef.current !== channelId) {
      channelRef.current = channelId;
      messageCountRef.current = 0;
      setIsAtBottom(true);
    }
  }, [channelId]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || messages.length === 0) return;

    const previousCount = messageCountRef.current;
    messageCountRef.current = messages.length;

    // Restoring after loading older messages: keep the viewport anchored.
    if (restoreRef.current) {
      const { height, top } = restoreRef.current;
      restoreRef.current = null;
      node.scrollTop = top + (node.scrollHeight - height);
      return;
    }

    // First paint, or new messages arriving while already pinned to the bottom.
    if (!isJumpingRef.current && (previousCount === 0 || isAtBottom)) {
      node.scrollTop = node.scrollHeight;
    }
  }, [isAtBottom, messages.length]);

  // Jump-to-message: scroll the target into view, pulling older pages until it
  // is loaded, then flash it so the eye can find it.
  useEffect(() => {
    if (!highlightedMessageId) return;
    const node = scrollRef.current;
    if (!node) return;

    let cancelled = false;
    isJumpingRef.current = true;

    const run = async () => {
      for (let attempt = 0; attempt <= JUMP_MAX_PAGES; attempt++) {
        if (cancelled) return;
        const target = node.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(highlightedMessageId)}"]`,
        );

        if (target) {
          target.scrollIntoView({ block: "center", behavior: "auto" });
          target.dataset.highlighted = "true";
          setTimeout(() => {
            delete target.dataset.highlighted;
            isJumpingRef.current = false;
            setHighlightedMessage(null);
          }, 2200);
          return;
        }

        if (!hasMore) break;
        restoreRef.current = { height: node.scrollHeight, top: node.scrollTop };
        await loadOlder();
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      }

      // Never found it — release the scroll lock rather than stranding the list.
      isJumpingRef.current = false;
      setHighlightedMessage(null);
    };

    void run();
    return () => {
      cancelled = true;
      isJumpingRef.current = false;
    };
  }, [hasMore, highlightedMessageId, loadOlder, setHighlightedMessage]);

  // Load older pages when the top sentinel scrolls into view.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const node = scrollRef.current;
    if (!sentinel || !node || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || isLoadingOlder) return;
        restoreRef.current = { height: node.scrollHeight, top: node.scrollTop };
        void loadOlder();
      },
      { root: node, rootMargin: "200px 0px 0px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingOlder, loadOlder]);

  if (isPending) return <MessageListSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <ErrorState
          title="Messages could not be loaded"
          description="The conversation history is temporarily unavailable."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-label={`Messages in ${conversation.name}`}
        className="scrollbar-thin absolute inset-0 overflow-y-auto overscroll-contain"
      >
        {hasMore ? (
          <div ref={topSentinelRef} className="flex justify-center py-4">
            <span className="flex items-center gap-1.5 text-2xs text-fg-subtle">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Loading earlier messages
            </span>
          </div>
        ) : (
          <ChannelIntro conversation={conversation} />
        )}

        {messages.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="No messages yet"
            description="Start the conversation — everything you send here is visible to channel members."
          />
        ) : (
          rows.map((row) => {
            if (row.type === "day") return <DayDivider key={row.key} timestamp={row.timestamp} />;
            if (row.type === "unread") return <UnreadDivider key={row.key} count={row.count} />;
            return (
              <MessageItem
                key={row.key}
                message={row.message}
                isGroupStart={row.isGroupStart}
                isGroupEnd={row.isGroupEnd}
              />
            );
          })
        )}

        <div className="h-3" />
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-3 flex justify-center transition-opacity",
          isAtBottom ? "opacity-0" : "opacity-100",
        )}
      >
        <Button
          variant="secondary"
          size="sm"
          tabIndex={isAtBottom ? -1 : 0}
          aria-hidden={isAtBottom}
          onClick={() => scrollToBottom("smooth")}
          className="pointer-events-auto rounded-full shadow-md"
        >
          <ArrowDown />
          Jump to latest
        </Button>
      </div>
    </div>
  );
}
