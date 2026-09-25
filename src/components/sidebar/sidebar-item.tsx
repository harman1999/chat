"use client";

import * as React from "react";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface SidebarItemProps extends React.ComponentProps<"button"> {
  /** Leading visual — channel glyph, avatar or nav icon. */
  leading: React.ReactNode;
  label: string;
  /** Right-aligned unread/mention indicator. */
  trailing?: React.ReactNode;
  isActive?: boolean;
  /** Bolds the label and shows the row as having unseen activity. */
  isUnread?: boolean;
  isMuted?: boolean;
  /** Rail mode: icon only, label moves into a tooltip. */
  isCollapsed?: boolean;
  /** Optional rail-mode substitute for `leading` when the icon alone is ambiguous. */
  collapsedLeading?: React.ReactNode;
  tooltipShortcut?: string;
}

/**
 * The single row primitive for everything in the workspace sidebar. Nav links,
 * channels and DMs all render through it so hover, active and unread states
 * stay identical across sections.
 */
export const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  function SidebarItem(
    {
      leading,
      label,
      trailing,
      isActive = false,
      isUnread = false,
      isMuted = false,
      isCollapsed = false,
      collapsedLeading,
      tooltipShortcut,
      className,
      ...props
    },
    ref,
  ) {
    const row = (
      <button
        ref={ref}
        type="button"
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group/item relative flex h-7 w-full items-center rounded-md text-sm transition-colors duration-100 focus-sidebar",
          isCollapsed ? "justify-center px-0" : "gap-2 px-2",
          isActive
            ? "bg-sidebar-active text-sidebar-active-fg"
            : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg",
          !isActive && isUnread && "text-sidebar-fg",
          isMuted && !isActive && "opacity-55",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "grid shrink-0 place-items-center [&_svg]:size-4",
            isActive ? "text-sidebar-active-fg" : "text-sidebar-subtle group-hover/item:text-sidebar-muted",
            !isActive && isUnread && "text-sidebar-muted",
          )}
        >
          {isCollapsed && collapsedLeading ? collapsedLeading : leading}
        </span>

        {!isCollapsed && (
          <>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-left leading-none",
                isUnread && !isActive ? "font-semibold" : "font-normal",
                isActive && "font-semibold",
              )}
            >
              {label}
            </span>
            {trailing && <span className="flex shrink-0 items-center gap-1">{trailing}</span>}
          </>
        )}

        {/* Rail mode keeps a dot so unread activity is still visible. */}
        {isCollapsed && isUnread && (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" aria-hidden />
        )}
      </button>
    );

    if (!isCollapsed) return row;

    return (
      <Hint label={label} shortcut={tooltipShortcut} side="right">
        {row}
      </Hint>
    );
  },
);
