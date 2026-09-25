import { formatDayDivider } from "@/lib/format";

/** Sticky date separator. Stays legible while a day's messages scroll past. */
export function DayDivider({ timestamp }: { timestamp: string }) {
  return (
    <div className="sticky top-0 z-[5] flex items-center gap-3 bg-surface px-3 py-2 sm:px-4">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-2xs font-semibold text-fg-muted shadow-xs">
        {formatDayDivider(timestamp)}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

/** Marks where the user's unread messages begin. */
export function UnreadDivider({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 sm:px-4">
      <span className="h-px flex-1 bg-danger/45" aria-hidden />
      <span className="text-2xs font-bold uppercase tracking-[0.06em] text-danger">
        {count} new {count === 1 ? "message" : "messages"}
      </span>
      <span className="h-px flex-1 bg-danger/45" aria-hidden />
    </div>
  );
}
