"use client";

import { Clock, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { STATUS_PRESETS } from "@/config";
import { userService } from "@/services";
import { cn } from "@/lib/utils";
import type { UserStatus } from "@/types";

const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: "Don't clear", minutes: null },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "4 hours", minutes: 240 },
  { label: "Today", minutes: 480 },
];

function expiryLabel(status: UserStatus): string | null {
  if (!status.expiresAt) return null;
  const minutes = Math.round((Date.parse(status.expiresAt) - Date.now()) / 60_000);
  if (minutes <= 0) return "Expired";
  if (minutes < 60) return `Clears in ${minutes} min`;
  return `Clears in ${Math.round(minutes / 60)} h`;
}

/**
 * Status editor used both in settings and from the profile menu. Keeps its own
 * draft so a half-typed status is never written until the user commits it.
 */
export function StatusControl({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<UserStatus | null>({
    emoji: "🎧",
    text: "Heads down",
    expiresAt: null,
  });
  const [isOpen, setIsOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftEmoji, setDraftEmoji] = useState("💬");
  const [draftMinutes, setDraftMinutes] = useState<number | null>(null);

  const openWith = (open: boolean) => {
    if (open) {
      setDraftText(status?.text ?? "");
      setDraftEmoji(status?.emoji ?? "💬");
      setDraftMinutes(null);
    }
    setIsOpen(open);
  };

  const commit = (next: UserStatus | null) => {
    setStatus(next);
    void userService.setCustomStatus(next);
    setIsOpen(false);
    toast.success(next ? "Status updated" : "Status cleared");
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "w-full")}>
      <Popover open={isOpen} onOpenChange={openWith}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm shadow-xs transition-colors hover:border-border-strong hover:bg-surface-hover",
              compact && "w-full",
            )}
          >
            <span aria-hidden className="text-base leading-none">
              {status?.emoji ?? "💬"}
            </span>
            <span className={cn("truncate", status ? "text-fg" : "text-fg-subtle")}>
              {status?.text ?? "Set a status"}
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-80 p-3">
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Change status emoji"
              onClick={() => {
                const pool: string[] = STATUS_PRESETS.map((preset) => preset.emoji);
                setDraftEmoji(pool[(pool.indexOf(draftEmoji) + 1) % pool.length]);
              }}
              className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-subtle text-base transition-colors hover:bg-surface-hover"
            >
              {draftEmoji}
            </button>
            <Input
              autoFocus
              value={draftText}
              maxLength={100}
              placeholder="What's your status?"
              aria-label="Status message"
              onChange={(event) => setDraftText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !draftText.trim()) return;
                event.preventDefault();
                commit({
                  emoji: draftEmoji,
                  text: draftText.trim(),
                  expiresAt: draftMinutes
                    ? new Date(Date.now() + draftMinutes * 60_000).toISOString()
                    : null,
                });
              }}
            />
          </div>

          <p className="mb-1 mt-3 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
            Suggestions
          </p>
          <ul className="max-h-44 space-y-px overflow-y-auto scrollbar-thin">
            {STATUS_PRESETS.map((preset) => (
              <li key={preset.text}>
                <button
                  type="button"
                  onClick={() => {
                    setDraftEmoji(preset.emoji);
                    setDraftText(preset.text);
                    setDraftMinutes(preset.minutes);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover"
                >
                  <span aria-hidden>{preset.emoji}</span>
                  <span className="truncate text-fg">{preset.text}</span>
                  {preset.minutes && (
                    <span className="ml-auto shrink-0 text-2xs text-fg-subtle">
                      {preset.minutes} min
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <Clock className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
            <select
              aria-label="Clear status after"
              value={draftMinutes ?? ""}
              onChange={(event) =>
                setDraftMinutes(event.target.value ? Number(event.target.value) : null)
              }
              className="h-7 flex-1 rounded-md border border-border bg-surface px-1.5 text-xs text-fg"
            >
              {DURATIONS.map((duration) => (
                <option key={duration.label} value={duration.minutes ?? ""}>
                  {duration.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!draftText.trim()}
              onClick={() =>
                commit({
                  emoji: draftEmoji,
                  text: draftText.trim(),
                  expiresAt: draftMinutes
                    ? new Date(Date.now() + draftMinutes * 60_000).toISOString()
                    : null,
                })
              }
            >
              Save status
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {status && (
        <>
          {expiryLabel(status) && (
            <span className="text-2xs text-fg-subtle">{expiryLabel(status)}</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => commit(null)}>
            <X />
            Clear
          </Button>
        </>
      )}
    </div>
  );
}
