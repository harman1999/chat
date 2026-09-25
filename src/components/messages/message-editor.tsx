"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

/** Inline edit surface. Enter saves, Shift+Enter breaks, Escape cancels. */
export function MessageEditor({
  initialValue,
  onSave,
  onCancel,
}: {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 320)}px`;
  }, [value]);

  const canSave = value.trim().length > 0;

  return (
    <div className="mt-0.5">
      <textarea
        ref={ref}
        value={value}
        rows={1}
        aria-label="Edit message"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (canSave) onSave(value);
          }
        }}
        className="w-full resize-none rounded-md border border-accent bg-surface px-2.5 py-1.5 text-base leading-relaxed text-fg outline-2 outline-offset-0 outline-[color-mix(in_oklch,var(--accent)_30%,transparent)] scrollbar-thin"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <Button size="sm" variant="primary" disabled={!canSave} onClick={() => onSave(value)}>
          Save changes
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="ml-auto hidden items-center gap-1 text-2xs text-fg-subtle sm:flex">
          <Kbd>Esc</Kbd> to cancel
        </span>
      </div>
    </div>
  );
}
