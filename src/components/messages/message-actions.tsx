"use client";

import * as React from "react";
import {
  Bookmark,
  BookmarkCheck,
  Copy,
  Link2,
  MessageSquareReply,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  SmilePlus,
  Trash2,
  MailOpen,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import { EmojiPicker } from "./emoji-picker";

/**
 * Forwards its ref and props to the underlying button so it can serve directly
 * as an `asChild` trigger. Previously each trigger wrapped this in a `<span>`,
 * which meant `aria-expanded` and `aria-haspopup` landed on the span rather
 * than the control a screen reader actually focuses.
 */
const ToolbarButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { label: string; shortcut?: string }
>(function ToolbarButton({ label, shortcut, className, children, ...props }, ref) {
  return (
    <Hint label={label} shortcut={shortcut} side="top">
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          "grid size-7 place-items-center rounded-md text-fg-muted transition-colors",
          "hover:bg-surface-hover hover:text-fg active:bg-surface-active",
          "[&_svg]:size-4",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Hint>
  );
});

export interface MessageActionHandlers {
  onReact: (emoji: string, name: string) => void;
  onReply: () => void;
  onToggleSave: () => void;
  onCopyText: () => void;
  onCopyLink: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onMarkUnread: () => void;
}

/**
 * Hover toolbar. Rendered for every message but only painted on hover, focus
 * within the row, or while one of its menus is open — so keyboard users get it
 * at exactly the same moments as pointer users.
 */
export function MessageActions({
  message,
  canManage,
  canReply = true,
  isMenuOpen,
  onMenuOpenChange,
  handlers,
}: {
  message: Message;
  canManage: boolean;
  /** Threads are one level deep, so replies themselves cannot be replied to. */
  canReply?: boolean;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  handlers: MessageActionHandlers;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg border border-border bg-surface-raised p-0.5 shadow-sm",
      )}
    >
      <EmojiPicker onSelect={handlers.onReact} align="end">
        <ToolbarButton label="Add reaction" shortcut="R">
          <SmilePlus />
        </ToolbarButton>
      </EmojiPicker>

      {canReply && (
        <ToolbarButton label="Reply in thread" shortcut="T" onClick={handlers.onReply}>
          <MessageSquareReply />
        </ToolbarButton>
      )}

      <ToolbarButton
        label={message.isSaved ? "Remove from saved" : "Save for later"}
        onClick={handlers.onToggleSave}
        className={cn(message.isSaved && "text-accent hover:text-accent")}
      >
        {message.isSaved ? <BookmarkCheck /> : <Bookmark />}
      </ToolbarButton>

      <ToolbarButton label="Copy text" onClick={handlers.onCopyText}>
        <Copy />
      </ToolbarButton>

      <DropdownMenu open={isMenuOpen} onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton label="More actions">
            <MoreVertical />
          </ToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {canManage && (
            <DropdownMenuItem onSelect={handlers.onEdit}>
              <Pencil />
              Edit message
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={handlers.onTogglePin}>
            {message.isPinned ? <PinOff /> : <Pin />}
            {message.isPinned ? "Unpin from channel" : "Pin to channel"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handlers.onToggleSave}>
            {message.isSaved ? <BookmarkCheck /> : <Bookmark />}
            {message.isSaved ? "Remove from saved" : "Save message"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handlers.onCopyLink}>
            <Link2 />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handlers.onMarkUnread}>
            <MailOpen />
            Mark unread from here
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="danger" onSelect={handlers.onDelete}>
                <Trash2 />
                Delete message
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
