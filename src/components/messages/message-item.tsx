"use client";

import { memo, useCallback, useRef, useState } from "react";
import { AlertCircle, Bot, Pin, UserPlus } from "lucide-react";
import { UserAvatar } from "@/components/common";
import { useCurrentUserId, useUser } from "@/hooks";
import { useTimeFormatter } from "@/hooks";
import { cn } from "@/lib/utils";
import { useMessageActions } from "@/hooks/useMessageActions";
import type { Message } from "@/types";
import { AttachmentList } from "./attachment-list";
import { MessageActions } from "./message-actions";
import { MessageBody } from "./message-body";
import { MessageEditor } from "./message-editor";
import { ReactionBar } from "./reaction-bar";
import { ThreadSummary } from "./thread-summary";

/** Join/leave/topic notices — one quiet line, never a full message block. */
function SystemMessage({ message }: { message: Message }) {
  const author = useUser(message.authorId);
  const formatTime = useTimeFormatter();
  return (
    <div className="flex items-center gap-2 py-1 pl-[3.25rem] pr-4 text-xs text-fg-subtle">
      <UserPlus className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">
        <span className="font-medium text-fg-muted">{author?.displayName ?? "Someone"}</span>{" "}
        {message.body}
      </span>
      <time dateTime={message.createdAt} className="ml-auto shrink-0 tabular-nums">
        {formatTime(message.createdAt)}
      </time>
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  isGroupStart: boolean;
  isGroupEnd: boolean;
  /** Renders without hover actions or thread affordance — used inside threads. */
  variant?: "channel" | "thread";
}

function MessageItemImpl({ message, isGroupStart, isGroupEnd, variant = "channel" }: MessageItemProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const actions = useMessageActions(message);
  const formatTime = useTimeFormatter();
  const currentUserId = useCurrentUserId();
  const author = useUser(message.authorId);

  // Touch has no hover, so the action toolbar is opened with a long press —
  // the same gesture every mobile messaging app uses.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPress = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }, []);

  const startPress = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType === "mouse") return;
      cancelPress();
      pressTimer.current = setTimeout(() => setIsMenuOpen(true), 450);
    },
    [cancelPress],
  );

  if (message.kind !== "text") return <SystemMessage message={message} />;

  const isMine = Boolean(currentUserId) && message.authorId === currentUserId;
  const mentionsMe = Boolean(currentUserId) && message.mentionedUserIds.includes(currentUserId!);
  const isPending = message.deliveryState === "pending";
  const isFailed = message.deliveryState === "failed";

  return (
    <article
      data-message-id={message.id}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerMove={cancelPress}
      onPointerCancel={cancelPress}
      className={cn(
        "group/message relative flex gap-2.5 px-3 transition-colors sm:px-4",
        isGroupStart ? "pt-[var(--message-gap-lg)]" : "pt-[var(--message-gap-sm)]",
        isGroupEnd && "pb-[var(--message-gap-lg)]",
        // Focus-within keeps the toolbar reachable for keyboard users.
        "hover:bg-surface-subtle focus-within:bg-surface-subtle",
        isMenuOpen && "bg-surface-subtle",
        mentionsMe && "bg-warning-subtle/45 hover:bg-warning-subtle/70",
        isPending && "opacity-60",
        // Set by MessageList after a jump from search, mentions or notifications.
        "data-[highlighted]:bg-accent-subtle data-[highlighted]:ring-1 data-[highlighted]:ring-inset data-[highlighted]:ring-accent/40",
      )}
    >
      {mentionsMe && (
        <span className="absolute inset-y-0 left-0 w-0.5 bg-warning" aria-hidden />
      )}

      {/* Gutter: avatar on the first message of a block, hover timestamp after */}
      <div className="w-9 shrink-0 pt-0.5">
        {isGroupStart ? (
          author && <UserAvatar user={author} size="lg" showPresence />
        ) : (
          <time
            dateTime={message.createdAt}
            className="mt-[3px] hidden justify-end text-2xs tabular-nums text-fg-subtle group-hover/message:flex group-focus-within/message:flex [@media(hover:none)]:flex"
          >
            {formatTime(message.createdAt)}
          </time>
        )}
      </div>

      <div className="min-w-0 flex-1 pb-0.5">
        {isGroupStart && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-fg">{author?.displayName ?? "Unknown"}</span>
            {author?.isBot && (
              <span className="inline-flex items-center gap-0.5 rounded bg-surface-active px-1 py-px text-[0.5625rem] font-bold uppercase tracking-wide text-fg-subtle">
                <Bot className="size-2.5" aria-hidden />
                App
              </span>
            )}
            <time dateTime={message.createdAt} className="text-2xs tabular-nums text-fg-subtle">
              {formatTime(message.createdAt)}
            </time>
            {message.isPinned && (
              <span className="inline-flex items-center gap-0.5 text-2xs font-medium text-fg-subtle">
                <Pin className="size-2.5" aria-hidden />
                Pinned
              </span>
            )}
          </div>
        )}

        {!isGroupStart && message.isPinned && (
          <span className="mb-0.5 flex items-center gap-0.5 text-2xs font-medium text-fg-subtle">
            <Pin className="size-2.5" aria-hidden />
            Pinned
          </span>
        )}

        {isEditing ? (
          <MessageEditor
            initialValue={message.body}
            onCancel={() => setIsEditing(false)}
            onSave={(value) => {
              actions.saveEdit(value);
              setIsEditing(false);
            }}
          />
        ) : (
          <>
            <MessageBody body={message.body} />
            {message.editedAt && (
              <span className="ml-1 align-baseline text-2xs text-fg-subtle" title={`Edited ${formatTime(message.editedAt)}`}>
                (edited)
              </span>
            )}
            <AttachmentList attachments={message.attachments} />
            {currentUserId && (
              <ReactionBar
                reactions={message.reactions}
                currentUserId={currentUserId}
                onToggle={actions.onReact}
              />
            )}
            {variant === "channel" && <ThreadSummary message={message} onOpen={actions.onReply} />}
          </>
        )}

        {isFailed && (
          <p className="mt-1 flex items-center gap-1.5 text-2xs text-danger">
            <AlertCircle className="size-3" aria-hidden />
            Not delivered.
            <button type="button" className="font-semibold underline underline-offset-2">
              Retry
            </button>
          </p>
        )}
      </div>

      {!isEditing && !isPending && (
        <div
          className={cn(
            "absolute -top-3.5 right-3 z-10 opacity-0 transition-opacity sm:right-4",
            "group-hover/message:opacity-100 group-focus-within/message:opacity-100",
            isMenuOpen && "opacity-100",
          )}
        >
          <MessageActions
            message={message}
            canManage={isMine}
            canReply={!message.threadRootId}
            isMenuOpen={isMenuOpen}
            onMenuOpenChange={setIsMenuOpen}
            handlers={{ ...actions, onEdit: () => setIsEditing(true) }}
          />
        </div>
      )}
    </article>
  );
}

/**
 * Memoised: a channel keeps hundreds of rows mounted, and a reaction on one
 * message must not re-render the rest of the list.
 */
export const MessageItem = memo(MessageItemImpl);
