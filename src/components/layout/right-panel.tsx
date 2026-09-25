"use client";

import { useActiveConversation } from "@/hooks";
import { useUIStore } from "@/store";
import { ThreadPanel } from "@/components/threads/thread-panel";
import { ChannelDetailsPanel } from "./channel-details-panel";
import { PinnedPanel } from "./pinned-panel";

/**
 * Chooses what the right-hand surface shows. Both the inline column and the
 * mobile slide-over render this, so the two never drift apart.
 */
export function RightPanel({ onClose }: { onClose?: () => void }) {
  const view = useUIStore((state) => state.rightPanelView);
  const threadRootId = useUIStore((state) => state.activeThreadRootId);
  const openRightPanel = useUIStore((state) => state.openRightPanel);
  const { data: conversation } = useActiveConversation();

  if (view === "thread" && threadRootId) {
    return <ThreadPanel rootId={threadRootId} onClose={onClose} />;
  }

  if (view === "pinned" && conversation) {
    return (
      <PinnedPanel
        conversation={conversation}
        onBack={() => openRightPanel("details")}
        onClose={onClose}
      />
    );
  }

  return <ChannelDetailsPanel onClose={onClose} />;
}
