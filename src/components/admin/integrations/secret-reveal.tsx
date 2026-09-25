"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface RevealedSecret {
  title: string;
  description: string;
  /** Usually one; an OAuth app hands back a client id and a secret together. */
  values: { label: string; value: string; isSecret: boolean }[];
}

/**
 * Shows a credential that exists in plaintext exactly once.
 *
 * Nothing stores these — only their hashes — so if this dialog closes before
 * the administrator copies the value, it is gone and the credential has to be
 * reissued. The copy says that plainly rather than leaving it to be discovered.
 */
export function SecretRevealDialog({
  secret,
  onClose,
}: {
  secret: RevealedSecret | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2_000);
    } catch {
      toast.error("Could not copy", { description: "Select the text and copy manually." });
    }
  };

  return (
    <Dialog open={secret !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{secret?.title}</DialogTitle>
          <DialogDescription>{secret?.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4">
          <p className="flex items-start gap-2 rounded-md bg-warning-subtle px-2.5 py-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Copy this now. It is stored only as a hash, so it cannot be shown again — a lost
              value has to be replaced rather than recovered.
            </span>
          </p>

          {secret?.values.map((entry) => (
            <div key={entry.label} className="space-y-1.5">
              <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                {entry.label}
              </p>
              <div className="flex gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-raised px-2.5 py-1.5 font-mono text-xs text-fg">
                  {entry.value}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label={`Copy ${entry.label}`}
                  onClick={() => void copy(entry.label, entry.value)}
                  className="h-8 w-8 shrink-0"
                >
                  {copied === entry.label ? <Check /> : <Copy />}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="primary" size="sm" onClick={onClose}>
            I have copied it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
