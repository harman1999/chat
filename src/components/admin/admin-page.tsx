import { cn } from "@/lib/utils";

/** Consistent page heading for every administration screen. */
export function AdminPage({
  title,
  description,
  actions,
  children,
  className,
  stickyHeader = false,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /**
   * Pins the heading and its actions just below the admin top bar, for pages
   * whose actions must stay reachable while the content scrolls — the
   * permission grid's Save and Discard. Offset by the top bar's own height, so
   * it sits under it rather than sliding over it.
   */
  stickyHeader?: boolean;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      <div
        className={cn(
          "flex flex-wrap items-start gap-3",
          stickyHeader &&
            "sticky top-[var(--spacing-topbar)] z-[5] -mx-2 border-b border-border bg-canvas px-2 py-3",
        )}
      >
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
