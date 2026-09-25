import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Two levels of emphasis: mentions are loud (filled accent), plain unreads are
 * quiet (a count in muted text) — matching how people actually triage.
 */
export function UnreadBadge({
  count,
  tone = "mention",
  className,
}: {
  count: number;
  tone?: "mention" | "unread";
  className?: string;
}) {
  if (count <= 0) return null;

  if (tone === "unread") {
    return (
      <span className={cn("text-2xs font-semibold tabular-nums text-sidebar-muted", className)}>
        {formatCount(count)}
      </span>
    );
  }

  return (
    <Badge
      variant="accent"
      size="sm"
      className={cn("tabular-nums", className)}
      aria-label={`${count} unread mentions`}
    >
      {formatCount(count)}
    </Badge>
  );
}
