"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { threadService } from "@/services";
import { useMessageStore } from "@/store";
import { buildMessageRows, type MessageRow } from "@/lib/message-grouping";
import type { ID, Message } from "@/types";

interface UseThreadResult {
  root: Message | null;
  replies: Message[];
  rows: MessageRow[];
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  isFollowing: boolean;
  unreadReplyCount: number;
  toggleFollowing: () => void;
  /** More replies exist beyond the loaded page. */
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
}

/**
 * Loads one thread: its root message and the full reply list.
 *
 * Replies live in the same normalised cache as channel messages, so a reaction
 * added in the thread panel shows up on the root's channel row immediately.
 */
export function useThread(rootId: ID): UseThreadResult {
  const ingestThread = useMessageStore((state) => state.ingestThread);
  const upsert = useMessageStore((state) => state.upsert);
  const setThreadMeta = useMessageStore((state) => state.setThreadMeta);
  const setThreadFollowing = useMessageStore((state) => state.setThreadFollowing);
  const markThreadRead = useMessageStore((state) => state.markThreadRead);

  const byId = useMessageStore((state) => state.byId);
  const replyIds = useMessageStore((state) => state.idsByThread[rootId]);
  const meta = useMessageStore((state) => state.threadMetaByRootId[rootId]);

  // Seeded from the first page during render rather than in an effect, so the
  // "Load more" control is correct on the same commit the replies appear.
  const [paging, setPaging] = useState<{
    rootId: ID;
    cursor: string | null;
    hasMore: boolean;
  } | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const query = useQuery({
    queryKey: ["thread", rootId],
    queryFn: async () => {
      const [root, page, thread] = await Promise.all([
        threadService.getRoot(rootId),
        threadService.listReplies(rootId),
        threadService.get(rootId),
      ]);
      return { root, replies: page.items, page, thread };
    },
    staleTime: Infinity,
    enabled: Boolean(rootId),
  });

  useEffect(() => {
    if (!query.data) return;
    const { root, replies, thread } = query.data;
    if (root) upsert(root);
    ingestThread(rootId, replies);
    setThreadMeta(rootId, {
      isFollowing: thread?.isFollowing ?? false,
      unreadReplyCount: thread?.unreadReplyCount ?? 0,
    });
  }, [ingestThread, query.data, rootId, setThreadMeta, upsert]);

  // Opening a thread is what marks its replies read.
  useEffect(() => {
    if (!meta || meta.unreadReplyCount === 0) return;
    const timer = setTimeout(() => {
      markThreadRead(rootId);
      void threadService.markRead(rootId);
    }, 1200);
    return () => clearTimeout(timer);
  }, [markThreadRead, meta, rootId]);

  const replies = useMemo(
    () => (replyIds ?? []).map((id) => byId[id]).filter(Boolean),
    [byId, replyIds],
  );

  const rows = useMemo(() => buildMessageRows(replies), [replies]);

  if (query.data && paging?.rootId !== rootId) {
    setPaging({
      rootId,
      cursor: query.data.page.nextCursor,
      hasMore: query.data.page.hasMore,
    });
  }

  const cursor = paging?.rootId === rootId ? paging.cursor : null;
  const hasMore = paging?.rootId === rootId ? paging.hasMore : false;

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await threadService.listReplies(rootId, cursor);
      ingestThread(rootId, page.items);
      setPaging({ rootId, cursor: page.nextCursor, hasMore: page.hasMore });
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, ingestThread, isLoadingMore, rootId]);

  const toggleFollowing = useCallback(() => {
    const next = !(meta?.isFollowing ?? false);
    setThreadFollowing(rootId, next);
    void threadService.setFollowing(rootId, next);
  }, [meta?.isFollowing, rootId, setThreadFollowing]);

  return {
    root: byId[rootId] ?? null,
    replies,
    rows,
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    isFollowing: meta?.isFollowing ?? false,
    unreadReplyCount: meta?.unreadReplyCount ?? 0,
    toggleFollowing,
    hasMore,
    isLoadingMore,
    loadMore,
  };
}
