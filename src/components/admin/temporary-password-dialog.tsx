"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface TemporaryPassword {
  displayName: string;
  username: string;
  password: string;
}

/**
 * Shows a temporary password once. The server keeps only a hash, so closing
 * this is the last chance to copy it — the copy says so, rather than letting an
 * administrator find out by trying to reopen it.
 */
export function TemporaryPasswordDialog({
  revealed,
  onClose,
}: {
  revealed: TemporaryPassword | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const close = () => {
    setCopied(false);
    onClose();
  };

  const copy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.password);
      setCopied(true);
      toast.success("Password copied");
    } catch {
      toast.error("Could not copy", { description: "Select the password and copy it manually." });
    }
  };

  return (
    <Dialog open={revealed !== null} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New password for {revealed?.displayName}</DialogTitle>
          <DialogDescription>
            @{revealed?.username} has been signed out everywhere and can sign in with this
            password now. Share it privately, and ask them to change it in Settings → Profile.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 px-5 py-4">
          <div className="flex gap-1.5">
            <code
              aria-label="Temporary password"
              className="min-w-0 flex-1 select-all break-all rounded-md border border-border bg-surface-raised px-2.5 py-1.5 font-mono text-sm text-fg"
            >
              {revealed?.password}
            </code>
            <Button variant="primary" size="sm" onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-2xs text-fg-subtle">
            Copy it now — for security it is only shown this once.
          </p>
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
