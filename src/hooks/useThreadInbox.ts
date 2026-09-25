"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { threadService, type ThreadInboxEntry } from "@/services";
import { useMessageStore } from "@/store";

/**
 * Followed threads, newest reply first.
 *
 * The fetched rows seed the message store's thread metadata, so read state has
 * exactly one owner — marking a thread read updates the card, the header count
 * and the sidebar badge together.
 */
export function useThreadInbox() {
  const seedThreadMeta = useMessageStore((state) => state.seedThreadMeta);

  const query = useQuery<ThreadInboxEntry[]>({
    queryKey: ["thread-inbox"],
    queryFn: () => threadService.inbox(),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!query.data) return;
    seedThreadMeta(
      query.data.map((entry) => ({
        rootId: entry.thread.rootId,
        isFollowing: entry.thread.isFollowing,
        unreadReplyCount: entry.thread.unreadReplyCount,
      })),
    );
  }, [query.data, seedThreadMeta]);

  return query;
}

/** Total unread replies across followed threads — read from the store. */
export function useThreadUnreadTotal(): number {
  const { data } = useThreadInbox();
  const metaByRootId = useMessageStore((state) => state.threadMetaByRootId);

  return useMemo(
    () =>
      (data ?? []).reduce(
        (sum, entry) =>
          sum + (metaByRootId[entry.thread.rootId]?.unreadReplyCount ?? entry.thread.unreadReplyCount),
        0,
      ),
    [data, metaByRootId],
  );
}
