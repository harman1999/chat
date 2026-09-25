"use client";

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Compact reaction picker. A curated set rather than a full emoji database —
 * it covers what teams actually react with and keeps the bundle honest.
 */
const EMOJI_GROUPS: { label: string; items: { emoji: string; name: string }[] }[] = [
  {
    label: "Frequently used",
    items: [
      { emoji: "👍", name: "thumbsup" },
      { emoji: "❤️", name: "heart" },
      { emoji: "🚀", name: "rocket" },
      { emoji: "🎉", name: "tada" },
      { emoji: "👀", name: "eyes" },
      { emoji: "✅", name: "white_check_mark" },
      { emoji: "🔥", name: "fire" },
      { emoji: "🙏", name: "pray" },
    ],
  },
  {
    label: "Reactions",
    items: [
      { emoji: "😄", name: "smile" },
      { emoji: "😂", name: "joy" },
      { emoji: "🤔", name: "thinking" },
      { emoji: "😅", name: "sweat_smile" },
      { emoji: "🙌", name: "raised_hands" },
      { emoji: "👏", name: "clap" },
      { emoji: "💯", name: "hundred" },
      { emoji: "🧠", name: "brain" },
    ],
  },
  {
    label: "Work",
    items: [
      { emoji: "📈", name: "chart_with_upwards_trend" },
      { emoji: "🐛", name: "bug" },
      { emoji: "🛠️", name: "tools" },
      { emoji: "📌", name: "pushpin" },
      { emoji: "⏳", name: "hourglass" },
      { emoji: "🚨", name: "rotating_light" },
      { emoji: "☕", name: "coffee" },
      { emoji: "🍞", name: "bread" },
    ],
  },
];

export function EmojiPicker({
  children,
  onSelect,
  align = "start",
  side = "top",
}: {
  children: React.ReactNode;
  onSelect: (emoji: string, name: string) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [term, setTerm] = useState("");

  const needle = term.trim().toLowerCase();
  const groups = EMOJI_GROUPS.map((group) => ({
    ...group,
    items: needle ? group.items.filter((item) => item.name.includes(needle)) : group.items,
  })).filter((group) => group.items.length > 0);

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setTerm("");
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-64 p-2">
        <Input
          autoFocus
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search emoji"
          aria-label="Search emoji"
          className="mb-2 h-7"
        />

        <div className="max-h-56 space-y-2 overflow-y-auto scrollbar-thin">
          {groups.length === 0 && (
            <p className="px-1 py-4 text-center text-xs text-fg-subtle">No emoji match “{term}”.</p>
          )}
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-1 px-0.5 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                {group.label}
              </p>
              <div className="grid grid-cols-8 gap-0.5">
                {group.items.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    title={`:${item.name}:`}
                    aria-label={`React with ${item.name}`}
                    onClick={() => {
                      onSelect(item.emoji, item.name);
                      setIsOpen(false);
                      setTerm("");
                    }}
                    className={cn(
                      "grid size-7 place-items-center rounded text-base transition-colors",
                      "hover:bg-surface-hover focus-visible:bg-surface-hover",
                    )}
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
