"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { channelService } from "@/services";
import { useMessageStore } from "@/store";
import type { Channel, ID } from "@/types";

/** Lets a burst of messages become one request. */
const DEBOUNCE_MS = 300;

/**
 * Marks the conversation being looked at as read — when it is opened, and again
 * whenever a message arrives in it — but only while the tab is visible.
 *
 * Nothing did this before: the only way to clear a channel's unread count was
 * to post in it, so every badge stayed until you did. Doing it on visibility
 * as well means messages that arrive while the tab is in the background stay
 * unread until you actually come back to them.
 *
 * The lists are patched in place first, so the badge clears at once instead of
 * after a round trip; the server call then makes it stick, and the bell and
 * workspace counts, which the server also changed, are refetched.
 */
export function useMarkConversationRead(conversationId: ID | null | undefined) {
  const queryClient = useQueryClient();
  const latestMessageId = useMessageStore((state) => {
    const ids = conversationId ? state.idsByChannel[conversationId] : undefined;
    return ids?.[ids.length - 1] ?? null;
  });

  useEffect(() => {
    if (!conversationId) return;
    const id = conversationId;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clear = (list: Channel[] | undefined) =>
      list?.map((item) => (item.id === id ? { ...item, unreadCount: 0, mentionCount: 0 } : item));

    const mark = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        queryClient.setQueriesData<Channel[]>({ queryKey: ["channels"] }, clear);
        queryClient.setQueriesData<Channel[]>({ queryKey: ["dms"] }, clear);
        queryClient.setQueryData<Channel | null>(["conversation", id], (current) =>
          current ? { ...current, unreadCount: 0, mentionCount: 0 } : current,
        );
        try {
          await channelService.markRead(id);
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        } catch {
          // Not marked after all: fetch the truth rather than show a clean badge.
          void queryClient.invalidateQueries({ queryKey: ["channels"] });
          void queryClient.invalidateQueries({ queryKey: ["dms"] });
        }
      }, DEBOUNCE_MS);
    };

    mark();
    // Coming back to the tab is when messages that arrived meanwhile are seen.
    document.addEventListener("visibilitychange", mark);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [conversationId, latestMessageId, queryClient]);
}
