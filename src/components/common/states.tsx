import type { LucideIcon } from "lucide-react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Canonical empty state. Every list in the product uses this — no bespoke copy blocks. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-1.5 px-4 py-8" : "gap-2 px-6 py-14",
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            "mb-1 grid place-items-center rounded-lg border border-border bg-surface-subtle text-fg-subtle",
            compact ? "size-8" : "size-10",
          )}
        >
          <Icon className={compact ? "size-4" : "size-[18px]"} />
        </span>
      )}
      <p className={cn("font-semibold text-fg", compact ? "text-sm" : "text-md")}>{title}</p>
      {description && (
        <p className="max-w-sm text-balance text-sm leading-relaxed text-fg-muted">{description}</p>
      )}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We could not load this content. Check your connection and try again.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-12 text-center", className)}>
      <span className="mb-1 grid size-10 place-items-center rounded-lg border border-danger/25 bg-danger-subtle text-danger">
        <AlertTriangle className="size-[18px]" />
      </span>
      <p className="text-md font-semibold text-fg">{title}</p>
      <p className="max-w-sm text-balance text-sm leading-relaxed text-fg-muted">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-2.5" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      )}
    </div>
  );
}

/** Loading placeholder for sidebar rows. */
export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-1 px-2 py-1", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex h-7 items-center gap-2 px-2">
          <Skeleton className="size-3.5 rounded-sm bg-sidebar-hover" />
          <Skeleton
            className="h-2.5 rounded-full bg-sidebar-hover"
            style={{ width: `${45 + ((index * 17) % 40)}%` }}
          />
        </div>
      ))}
    </div>
  );
}
