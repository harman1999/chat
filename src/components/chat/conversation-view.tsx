"use client";

import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveConversation } from "@/hooks";
import { useMessageStore, useSettingsStore } from "@/store";
import { ChannelHeader } from "./channel-header";
import { MessageComposer } from "./composer/message-composer";
import { MessageList } from "./message-list";
import { MessageListSkeleton } from "./message-skeleton";
import { TypingIndicator } from "./typing-indicator";

/** Stable empty array so the typing selector never returns a fresh reference. */
const EMPTY: string[] = [];

/** The centre column: header, scrolling history, typing row and composer. */
export function ConversationView() {
  const { data: conversation, isPending } = useActiveConversation();
  const typingUserIds = useMessageStore(
    (state) => state.typingByChannel[conversation?.id ?? ""] ?? EMPTY,
  );
  const showTypingIndicators = useSettingsStore((state) => state.messages.showTypingIndicators);

  if (isPending) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-surface">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <Skeleton className="h-3.5 w-28 rounded-full" />
          <Skeleton className="hidden h-2.5 w-52 rounded-full md:block" />
        </div>
        <MessageListSkeleton />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center bg-surface">
        <EmptyState
          icon={MessagesSquare}
          title="No conversation selected"
          description="Pick a channel or direct message from the sidebar to get started."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
      <ChannelHeader conversation={conversation} />
      <MessageList conversation={conversation} />
      <div className="px-3 sm:px-4">
        <TypingIndicator userIds={showTypingIndicators ? typingUserIds : EMPTY} />
      </div>
      <MessageComposer conversation={conversation} />
    </div>
  );
}
