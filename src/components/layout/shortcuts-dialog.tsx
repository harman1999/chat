"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useMounted } from "@/hooks";
import { displayKey, isApplePlatform, SHORTCUTS, type Shortcut } from "@/lib/keyboard";
import { useUIStore } from "@/store";

const GROUPS: Shortcut["group"][] = ["Navigation", "Messaging", "Application"];

export function ShortcutsDialog() {
  const isOpen = useUIStore((state) => state.isShortcutsOpen);
  const setOpen = useUIStore((state) => state.setShortcutsOpen);
  const mounted = useMounted();
  const isApple = mounted && isApplePlatform();

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Every action below also has a visible control.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-5 py-4 scrollbar-thin">
          {GROUPS.map((group) => (
            <section key={group}>
              <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                {group}
              </h3>
              <ul className="divide-y divide-border">
                {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
                  <li key={shortcut.id} className="flex items-center justify-between gap-4 py-1.5">
                    <span className="text-sm text-fg-muted">{shortcut.label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <Kbd key={key}>{displayKey(key, isApple)}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
