"use client";

import { useCallback } from "react";
import { useUIStore, useWorkspaceStore } from "@/store";
import type { ID } from "@/types";

/**
 * Navigation used by search results, mentions and notifications: switch to the
 * conversation, then let the message list scroll to and flash the target.
 *
 * The scrolling itself lives in `MessageList` because only it knows which page
 * of history is loaded and how to fetch further back.
 */
export function useJumpToMessage() {
  const setActiveConversation = useWorkspaceStore((state) => state.setActiveConversation);
  const setNavSection = useWorkspaceStore((state) => state.setNavSection);
  const setHighlightedMessage = useUIStore((state) => state.setHighlightedMessage);
  const closeThread = useUIStore((state) => state.closeThread);
  const setSearchOpen = useUIStore((state) => state.setSearchOpen);

  return useCallback(
    (channelId: ID, messageId?: ID | null) => {
      setSearchOpen(false);
      closeThread();
      setNavSection("home");
      setActiveConversation(channelId);
      setHighlightedMessage(messageId ?? null);
    },
    [closeThread, setActiveConversation, setHighlightedMessage, setNavSection, setSearchOpen],
  );
}
