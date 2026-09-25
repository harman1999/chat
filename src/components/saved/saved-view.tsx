"use client";

import { Bookmark, BookmarkX, Hash, Lock } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, UserAvatar } from "@/components/common";
import { MessageBody } from "@/components/messages/message-body";
import { ReactionBar } from "@/components/messages/reaction-bar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useConversationMap,
  useCurrentUserId,
  useJumpToMessage,
  useSaved,
  useTimeFormatter,
  useUser,
} from "@/hooks";
import { formatDayDivider } from "@/lib/format";
import { messageService } from "@/services";
import { useMessageStore } from "@/store";
import type { Message } from "@/types";

function SavedCard({ message, onOpen }: { message: Message; onOpen: () => void }) {
  const author = useUser(message.authorId);
  const currentUserId = useCurrentUserId();
  const conversation = useConversationMap()[message.channelId];
  const patch = useMessageStore((state) => state.patch);
  const formatTime = useTimeFormatter();

  const isChannel = conversation?.kind === "public" || conversation?.kind === "private";
  const Glyph = conversation?.kind === "private" ? Lock : Hash;

  return (
    <article className="rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
      <header className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-fg">
          {isChannel && <Glyph className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />}
          <span className="truncate">{conversation?.name ?? "Conversation"}</span>
        </span>
        <time dateTime={message.createdAt} className="ml-auto shrink-0 text-2xs text-fg-subtle">
          {formatDayDivider(message.createdAt)} · {formatTime(message.createdAt)}
        </time>
      </header>

      <div className="flex gap-2.5 px-3 py-2.5">
        {author && <UserAvatar user={author} size="md" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">{author?.displayName}</p>
          <MessageBody body={message.body} className="mt-0.5" />
          {currentUserId && (
            <ReactionBar reactions={message.reactions} currentUserId={currentUserId} readOnly />
          )}
        </div>
      </div>

      <footer className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        <Button variant="ghost" size="sm" onClick={onOpen}>
          Jump to message
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={async () => {
            patch(message.id, { isSaved: false });
            try {
              await messageService.setSaved(message.id, false);
              toast.success("Removed from saved");
            } catch {
              patch(message.id, { isSaved: true });
              toast.error("Could not remove from saved");
            }
          }}
        >
          <BookmarkX />
          Remove
        </Button>
      </footer>
    </article>
  );
}

export function SavedView() {
  const { messages, isPending } = useSaved();
  const jumpToMessage = useJumpToMessage();

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-md font-semibold tracking-tight text-fg">Saved</h1>
          <p className="truncate text-2xs text-fg-subtle">
            {messages.length > 0
              ? `${messages.length} saved ${messages.length === 1 ? "message" : "messages"}`
              : "Messages you save for later"}
          </p>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        {isPending && messages.length === 0 ? (
          <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4" aria-hidden>
            {[0, 1].map((row) => (
              <Skeleton key={row} className="h-32 rounded-lg" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet"
            description="Hover a message and choose Save for later to keep it here."
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
            {messages.map((message) => (
              <SavedCard
                key={message.id}
                message={message}
                onOpen={() => jumpToMessage(message.channelId, message.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
