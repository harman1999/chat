import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A single headline number. Deliberately plain: label, value, one supporting
 * line — no sparkline competing with the value for attention.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  isPending = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  /** Percentage change; positive is not automatically "good", so no colour cue beyond direction. */
  delta?: number;
  isPending?: boolean;
}) {
  if (isPending) {
    return (
      <div className="rounded-lg border border-border bg-surface p-3.5">
        <Skeleton className="h-2.5 w-20 rounded-full" />
        <Skeleton className="mt-3 h-6 w-24 rounded-md" />
        <Skeleton className="mt-2 h-2 w-28 rounded-full" />
      </div>
    );
  }

  const Trend = delta !== undefined && delta < 0 ? TrendingDown : TrendingUp;

  return (
    <div className="rounded-lg border border-border bg-surface p-3.5">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />}
        <p className="truncate text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
          {label}
        </p>
      </div>
      {/* Proportional figures: tabular-nums makes a large standalone number read loose. */}
      <p className="mt-2 text-2xl font-semibold tracking-tight text-fg">{value}</p>
      {(hint || delta !== undefined) && (
        <p className="mt-1 flex items-center gap-1.5 text-2xs text-fg-muted">
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold tabular-nums",
                delta < 0 ? "text-danger" : "text-success",
              )}
            >
              <Trend className="size-3" aria-hidden />
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)}%
            </span>
          )}
          {hint && <span className="truncate">{hint}</span>}
        </p>
      )}
    </div>
  );
}
