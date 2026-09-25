"use client";

import { useUserMap } from "@/hooks";
import { cn } from "@/lib/utils";

function phrase(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more are typing`;
}

/**
 * Driven by `typing.started` / `typing.stopped` events. Reserves its own row so
 * the composer never shifts when someone starts or stops typing.
 */
export function TypingIndicator({ userIds, className }: { userIds: string[]; className?: string }) {
  const usersById = useUserMap();
  const names = userIds.map((id) => usersById[id]?.displayName).filter(Boolean) as string[];

  return (
    <div
      aria-live="polite"
      className={cn("flex h-4 items-center gap-1.5 px-1 text-2xs text-fg-subtle", className)}
    >
      {names.length > 0 && (
        <>
          <span className="flex gap-0.5" aria-hidden>
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="size-1 animate-bounce rounded-full bg-fg-subtle"
                style={{ animationDelay: `${dot * 120}ms`, animationDuration: "900ms" }}
              />
            ))}
          </span>
          <span className="truncate">{phrase(names)}…</span>
        </>
      )}
    </div>
  );
}
