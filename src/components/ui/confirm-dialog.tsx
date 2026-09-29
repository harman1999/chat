"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  /** What will happen, in plain words — not "Are you sure?". */
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get the danger button and the warning glyph. */
  destructive?: boolean;
  /** Runs on Yes. The dialog stays open, with a spinner, until it settles. */
  onConfirm: () => Promise<void> | void;
}

/**
 * A yes/no question before something that is hard to take back.
 *
 * Two deliberate choices. The dialog stays open while the action runs, so a
 * slow request cannot be confirmed twice by an impatient second click. And the
 * safe answer holds focus when it opens: pressing Enter on a destructive
 * prompt should cancel, not delete.
 */
export function ConfirmDialog({
  options,
  onClose,
}: {
  options: ConfirmOptions | null;
  onClose: () => void;
}) {
  const [isRunning, setIsRunning] = useState(false);

  const confirm = async () => {
    if (!options) return;
    setIsRunning(true);
    try {
      await options.onConfirm();
      onClose();
    } catch {
      // A failed action leaves the dialog open, so it cannot read as success.
      // The caller has already reported why (a toast, usually); swallowing here
      // only stops the rejection escaping as an unhandled error.
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Dialog
      open={options !== null}
      onOpenChange={(next) => {
        // Not dismissable mid-action: closing would hide whether it worked.
        if (!next && !isRunning) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {options?.destructive && (
              <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />
            )}
            {options?.title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-fg-muted">{options?.description}</div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            autoFocus
            disabled={isRunning}
            onClick={onClose}
          >
            {options?.cancelLabel ?? "No"}
          </Button>
          <Button
            variant={options?.destructive ? "danger" : "primary"}
            size="sm"
            disabled={isRunning}
            onClick={() => void confirm()}
          >
            {isRunning && <Loader2 className="animate-spin" />}
            {options?.confirmLabel ?? "Yes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
