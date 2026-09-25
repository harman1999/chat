"use client";

import { UserAvatar } from "@/components/common";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

/**
 * Inline @-mention list. Anchored above the composer rather than at the caret —
 * predictable placement beats pixel-accurate tracking in a growing textarea.
 */
export function MentionMenu({
  users,
  activeIndex,
  onSelect,
}: {
  users: User[];
  activeIndex: number;
  onSelect: (user: User) => void;
}) {
  if (users.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Mention a teammate"
      className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-lg"
    >
      <p className="px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        People
      </p>
      <ul className="max-h-56 overflow-y-auto scrollbar-thin">
        {users.map((user, index) => (
          <li key={user.id}>
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                // Keep focus in the textarea so the caret never jumps.
                event.preventDefault();
                onSelect(user);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
                index === activeIndex ? "bg-surface-hover" : "hover:bg-surface-hover",
              )}
            >
              <UserAvatar user={user} size="sm" showPresence ringClassName="border-surface-raised" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-fg">
                  {user.displayName}
                </span>
                <span className="block truncate text-[0.625rem] text-fg-subtle">{user.title}</span>
              </span>
              <span className="shrink-0 text-2xs text-fg-subtle">@{user.username}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
