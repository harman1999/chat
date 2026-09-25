"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { messageService } from "@/services";
import { useMessageStore, useSettingsStore } from "@/store";
import { buildMessageRows, type MessageRow } from "@/lib/message-grouping";
import type { ID, Message } from "@/types";

interface UseMessagesResult {
  messages: Message[];
  rows: MessageRow[];
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  hasMore: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => Promise<void>;
}

/**
 * Loads the newest page for a channel and exposes backwards pagination.
 *
 * Only the loaded window is ever mounted, which is what keeps a channel with
 * thousands of messages responsive. `rows` is the single seam a virtualiser
 * would slot into later without touching any component.
 */
export function useMessages(channelId: ID): UseMessagesResult {
  const ingest = useMessageStore((state) => state.ingest);
  const setPage = useMessageStore((state) => state.setPage);
  const ids = useMessageStore((state) => state.idsByChannel[channelId]);
  const byId = useMessageStore((state) => state.byId);
  const hasMore = useMessageStore((state) => state.hasMoreByChannel[channelId] ?? false);
  const cursor = useMessageStore((state) => state.cursorByChannel[channelId] ?? null);

  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const groupConsecutive = useSettingsStore((state) => state.messages.groupConsecutive);

  const query = useQuery({
    queryKey: ["messages", channelId],
    queryFn: () => messageService.list(channelId),
    // The store owns the merged result, so the page itself never goes stale.
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!query.data) return;
    ingest(channelId, query.data.items);
    setPage(channelId, query.data.nextCursor, query.data.hasMore);
  }, [channelId, ingest, query.data, setPage]);

  const loadOlder = useCallback(async () => {
    if (!hasMore || !cursor || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const page = await messageService.list(channelId, cursor);
      ingest(channelId, page.items, { position: "head" });
      setPage(channelId, page.nextCursor, page.hasMore);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [channelId, cursor, hasMore, ingest, isLoadingOlder, setPage]);

  const messages = useMemo(
    () => (ids ?? []).map((id) => byId[id]).filter(Boolean),
    [byId, ids],
  );

  const rows = useMemo(
    () => buildMessageRows(messages, { groupConsecutive }),
    [groupConsecutive, messages],
  );

  return {
    messages,
    rows,
    isPending: query.isPending && messages.length === 0,
    isError: query.isError,
    refetch: query.refetch,
    hasMore,
    isLoadingOlder,
    loadOlder,
  };
}
