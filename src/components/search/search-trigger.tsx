"use client";

import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { useMounted } from "@/hooks";
import { isApplePlatform } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";

/**
 * Top-bar search affordance. Looks like a field but is a button — the real
 * search surface is the command dialog it opens (Phase 4).
 */
export function SearchTrigger({ className }: { className?: string }) {
  const setSearchOpen = useUIStore((state) => state.setSearchOpen);
  const mounted = useMounted();
  const modKey = mounted && isApplePlatform() ? "⌘" : "Ctrl";

  return (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      aria-label="Search messages, people and channels"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "group flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface-subtle px-2.5 text-left shadow-xs transition-colors",
        "hover:border-border-strong hover:bg-surface",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-fg-subtle transition-colors group-hover:text-fg-muted" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-fg-subtle">
        Search messages, people and channels
      </span>
      <span className="hidden shrink-0 items-center gap-0.5 sm:flex" aria-hidden>
        <Kbd>{modKey}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
