"use client";

import { SmilePlus } from "lucide-react";
import { useUserMap } from "@/hooks";
import { cn } from "@/lib/utils";
import type { ID, Reaction, User } from "@/types";
import { Hint } from "@/components/ui/tooltip";
import { EmojiPicker } from "./emoji-picker";

function reactionLabel(
  reaction: Reaction,
  currentUserId: ID,
  usersById: Record<ID, User>,
): string {
  const names = reaction.userIds
    .map((id) => (id === currentUserId ? "You" : usersById[id]?.displayName))
    .filter(Boolean);

  const list =
    names.length <= 3
      ? names.join(", ")
      : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;

  return `${list} reacted with :${reaction.name}:`;
}

export function ReactionBar({
  reactions,
  currentUserId,
  onToggle,
  readOnly = false,
  className,
}: {
  reactions: Reaction[];
  currentUserId: ID;
  onToggle?: (emoji: string, name: string) => void;
  /** Counts only — used in previews where reacting is not offered. */
  readOnly?: boolean;
  className?: string;
}) {
  const usersById = useUserMap();

  if (reactions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1 pt-1", className)}>
      {reactions.map((reaction) => {
        const isMine = reaction.userIds.includes(currentUserId);
        const label = reactionLabel(reaction, currentUserId, usersById);
        return (
          <Hint key={reaction.emoji} label={label} side="top">
            <button
              type="button"
              // The visible content is an emoji and a count, which a screen
              // reader announces as a bare number. The tooltip text is only
              // described, not the name, so state it explicitly.
              aria-label={label}
              aria-pressed={isMine}
              disabled={readOnly}
              onClick={() => onToggle?.(reaction.emoji, reaction.name)}
              className={cn(
                "flex h-[22px] items-center gap-1 rounded-full border px-1.5 text-2xs font-semibold tabular-nums transition-colors",
                isMine
                  ? "border-accent/45 bg-accent-subtle text-accent-subtle-fg"
                  : "border-border bg-surface-subtle text-fg-muted",
                !readOnly &&
                  !isMine &&
                  "hover:border-border-strong hover:bg-surface-hover",
                readOnly && "cursor-default",
              )}
            >
              <span aria-hidden className="text-[0.8125rem] leading-none">
                {reaction.emoji}
              </span>
              {reaction.count}
            </button>
          </Hint>
        );
      })}

      {!readOnly && onToggle && (
        <EmojiPicker onSelect={onToggle}>
          <button
            type="button"
            aria-label="Add reaction"
            className="grid h-[22px] w-7 place-items-center rounded-full border border-dashed border-border text-fg-subtle transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-fg-muted"
          >
            <SmilePlus className="size-3.5" />
          </button>
        </EmojiPicker>
      )}
    </div>
  );
}
