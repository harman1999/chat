import { cn } from "@/lib/utils";

/** Consistent page heading for every administration screen. */
export function AdminPage({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex flex-wrap items-start gap-3">
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
