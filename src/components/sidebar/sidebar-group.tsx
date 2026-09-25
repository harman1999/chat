"use client";

import * as React from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Collapsible section heading used for Channels and Direct messages.
 * The add button only appears on hover/focus to keep the sidebar quiet.
 */
export function SidebarGroup({
  id,
  title,
  isCollapsed,
  isOpen,
  onToggle,
  onAdd,
  addLabel,
  children,
}: {
  id: string;
  title: string;
  /** Rail mode — headings are replaced by a hairline divider. */
  isCollapsed?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}) {
  const contentId = `sidebar-group-${id}`;

  if (isCollapsed) {
    return (
      <section aria-label={title} className="space-y-0.5">
        <div className="mx-auto my-2 h-px w-6 bg-sidebar-border" aria-hidden />
        {children}
      </section>
    );
  }

  return (
    <section className="group/group" aria-labelledby={`${contentId}-heading`}>
      <div className="flex h-7 items-center gap-1 pl-1 pr-1">
        <button
          type="button"
          id={`${contentId}-heading`}
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex h-6 min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-2xs font-semibold uppercase tracking-[0.06em] text-sidebar-subtle transition-colors hover:text-sidebar-fg focus-sidebar"
        >
          <ChevronDown
            className={cn("size-3 shrink-0 transition-transform duration-150", !isOpen && "-rotate-90")}
            aria-hidden
          />
          <span className="truncate">{title}</span>
        </button>

        {onAdd && (
          <Hint label={addLabel ?? `Add ${title.toLowerCase()}`} side="top">
            <button
              type="button"
              onClick={onAdd}
              aria-label={addLabel ?? `Add ${title.toLowerCase()}`}
              className="grid size-5 shrink-0 place-items-center rounded text-sidebar-subtle opacity-0 transition-[opacity,background-color,color] hover:bg-sidebar-hover hover:text-sidebar-fg focus-sidebar focus-visible:opacity-100 group-hover/group:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <Plus className="size-3.5" />
            </button>
          </Hint>
        )}
      </div>

      <div id={contentId} hidden={!isOpen} className="space-y-px">
        {children}
      </div>
    </section>
  );
}
