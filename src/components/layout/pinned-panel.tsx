"use client";

import { Pin } from "lucide-react";
import { EmptyState } from "@/components/common";
import { MessagePreview } from "@/components/messages/message-preview";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessageStore } from "@/store";
import type { Channel } from "@/types";
import { PanelHeader } from "./panel-header";

/** All pinned messages for a conversation. */
export function PinnedPanel({
  conversation,
  onBack,
  onClose,
}: {
  conversation: Channel;
  onBack: () => void;
  onClose?: () => void;
}) {
  const byId = useMessageStore((state) => state.byId);
  const ids = useMessageStore((state) => state.idsByChannel[conversation.id]);
  const pinned = (ids ?? []).map((id) => byId[id]).filter((message) => message?.isPinned);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <PanelHeader
        title="Pinned messages"
        subtitle={`${pinned.length} in ${conversation.kind === "public" || conversation.kind === "private" ? `#${conversation.name}` : conversation.name}`}
        onClose={onClose}
        actions={
          <button
            type="button"
            onClick={onBack}
            className="rounded px-1.5 py-1 text-2xs font-semibold text-accent transition-colors hover:bg-accent-subtle"
          >
            Details
          </button>
        }
      />
      <ScrollArea className="min-h-0 flex-1 p-3">
        {pinned.length === 0 ? (
          <EmptyState
            icon={Pin}
            title="No pinned messages"
            description="Pin important messages so the team can find them here."
            compact
          />
        ) : (
          <div className="space-y-2">
            {pinned.map((message) => (
              <MessagePreview key={message.id} message={message} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
