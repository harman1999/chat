"use client";

import { Slash } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SlashCommand } from "@/types";

/**
 * Inline slash-command list.
 *
 * Anchored above the composer like the mention menu, for the same reason —
 * predictable placement beats tracking a caret in a growing textarea.
 */
export function CommandMenu({
  commands,
  activeIndex,
  onSelect,
}: {
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
}) {
  if (commands.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Run a command"
      className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-lg"
    >
      <p className="px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        Commands
      </p>
      <ul className="max-h-56 overflow-y-auto scrollbar-thin">
        {commands.map((command, index) => (
          <li key={command.id}>
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                // Keep focus in the textarea so the caret never jumps.
                event.preventDefault();
                onSelect(command);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors",
                index === activeIndex ? "bg-surface-hover" : "hover:bg-surface-hover",
              )}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-active text-fg-muted">
                <Slash className="size-3" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-fg">
                  /{command.command}
                  {command.usageHint && (
                    <span className="ml-1 font-normal text-fg-subtle">{command.usageHint}</span>
                  )}
                </span>
                <span className="block truncate text-[0.625rem] text-fg-subtle">
                  {command.description || command.name}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
