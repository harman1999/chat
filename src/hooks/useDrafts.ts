"use client";

import { useMemo } from "react";
import { useConversationMap } from "./useDirectory";
import { useMessageStore } from "@/store";
import type { Channel } from "@/types";

export interface DraftEntry {
  /** Conversation id, or `thread:<rootId>` for a thread draft. */
  key: string;
  body: string;
  conversation: Channel | null;
  threadRootId: string | null;
}

/** Unsent composer content, read straight from the message store. */
export function useDrafts(): DraftEntry[] {
  const draftByChannel = useMessageStore((state) => state.draftByChannel);
  const byId = useMessageStore((state) => state.byId);
  const conversationsById = useConversationMap();

  return useMemo(
    () =>
      Object.entries(draftByChannel)
        .filter(([, body]) => body.trim().length > 0)
        .map(([key, body]) => {
          const threadRootId = key.startsWith("thread:") ? key.slice("thread:".length) : null;
          const channelId = threadRootId ? byId[threadRootId]?.channelId : key;
          return {
            key,
            body,
            threadRootId,
            conversation: channelId ? conversationsById[channelId] ?? null : null,
          };
        }),
    [byId, conversationsById, draftByChannel],
  );
}
