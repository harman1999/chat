"use client";

import { useEffect } from "react";

export interface HotkeyBinding {
  /** Lower-case `event.key`, e.g. "k", ".", "/". */
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (event: KeyboardEvent) => void;
  /** Fire even when focus is inside an input or textarea. */
  allowInInput?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

export function useHotkeys(bindings: HotkeyBinding[]) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      for (const binding of bindings) {
        if (event.key.toLowerCase() !== binding.key.toLowerCase()) continue;
        if (Boolean(binding.mod) !== (event.metaKey || event.ctrlKey)) continue;
        if (Boolean(binding.shift) !== event.shiftKey) continue;
        if (Boolean(binding.alt) !== event.altKey) continue;
        if (!binding.allowInInput && isEditableTarget(event.target)) continue;
        event.preventDefault();
        binding.handler(event);
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bindings]);
}
