"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared header for the right-hand panel and its mobile slide-over. */
export function PanelHeader({
  title,
  subtitle,
  onClose,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 border-b border-border px-3",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold leading-tight text-fg">{title}</h2>
        {subtitle && <p className="truncate text-2xs leading-tight text-fg-subtle">{subtitle}</p>}
      </div>
      {actions}
      {onClose && (
        <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose}>
          <X />
        </Button>
      )}
    </div>
  );
}
