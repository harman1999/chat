"use client";

import { AtSign, Hash, Lock } from "lucide-react";
import { EmptyState, ErrorState, UserAvatar } from "@/components/common";
import { MessageBody } from "@/components/messages/message-body";
import { ReactionBar } from "@/components/messages/reaction-bar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useConversationMap,
  useCurrentUserId,
  useJumpToMessage,
  useMentions,
  useTimeFormatter,
  useUser,
} from "@/hooks";
import { formatDayDivider } from "@/lib/format";
import type { Message } from "@/types";

function MentionCard({ message, onOpen }: { message: Message; onOpen: () => void }) {
  const author = useUser(message.authorId);
  const formatTime = useTimeFormatter();
  const currentUserId = useCurrentUserId();
  const conversation = useConversationMap()[message.channelId];
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

      <footer className="border-t border-border px-3 py-1.5">
        <button
          type="button"
          onClick={onOpen}
          className="rounded px-1 py-0.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-subtle"
        >
          Jump to message
        </button>
      </footer>
    </article>
  );
}

/** Every message that mentions you, newest first. */
export function MentionsView() {
  const { data, isPending, isError, refetch } = useMentions();
  const jumpToMessage = useJumpToMessage();

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-md font-semibold tracking-tight text-fg">Mentions</h1>
          <p className="truncate text-2xs text-fg-subtle">
            {data?.length ? `${data.length} messages mention you` : "Messages that mention you"}
          </p>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        {isPending ? (
          <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4" aria-hidden>
            {[0, 1, 2].map((row) => (
              <div key={row} className="space-y-2 rounded-lg border border-border bg-surface p-3">
                <Skeleton className="h-2.5 w-24 rounded-full" />
                <div className="flex gap-2.5">
                  <Skeleton className="size-8 shrink-0 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-2.5 w-28 rounded-full" />
                    <Skeleton className="h-2.5 w-full rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title="Mentions could not be loaded"
            description="Your mentions are temporarily unavailable."
            onRetry={() => refetch()}
          />
        ) : !data || data.length === 0 ? (
          <EmptyState
            icon={AtSign}
            title="No mentions yet"
            description="When someone @-mentions you, the message shows up here."
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
            {data.map((message) => (
              <MentionCard
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
