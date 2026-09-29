"use client";

import { Building2, Loader2, LogIn } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reloadAs } from "@/lib/navigation";
import { workspaceService } from "@/services";
import { isApiError } from "@/services/http";
import { useWorkspaceStore } from "@/store";
import type { Workspace } from "@/types";

/** Enters a workspace after the server has moved the session there. */
function enter(workspaceId: string) {
  useWorkspaceStore.getState().setWorkspace(workspaceId);
  reloadAs("/workspace");
}

function messageOf(error: unknown, fallback: string): string {
  return isApiError(error) ? error.message : fallback;
}

/** Owners and administrators only; the menu item is not shown to anyone else. */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (isSaving) return;
    onOpenChange(next);
    if (!next) {
      setName("");
      setPassword("");
      setError(null);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !password || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const created = await workspaceService.create({ name: name.trim(), password });
      enter(created.workspaceId);
    } catch (caught) {
      setError(messageOf(caught, "Could not create the workspace."));
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Create a workspace</DialogTitle>
            <DialogDescription>
              A separate workspace with its own people, channels and settings — nothing here
              is shared with it. You become its owner, with a new account there that starts
              with your current email and password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-workspace-name">Workspace name</Label>
              <Input
                id="new-workspace-name"
                autoFocus
                value={name}
                maxLength={80}
                placeholder="e.g. Acme Research"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-workspace-password">Your password</Label>
              <Input
                id="new-workspace-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-2xs text-fg-subtle">To confirm it is you.</p>
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!name.trim() || !password || isSaving}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Building2 />}
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Switches to this email's account in another workspace. It is a separate
 * account, so it asks for that account's password.
 */
export function SwitchWorkspaceDialog({
  target,
  onClose,
}: {
  target: Workspace | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (isSwitching) return;
    setPassword("");
    setError(null);
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target || !password || isSwitching) return;
    setIsSwitching(true);
    setError(null);
    try {
      await workspaceService.switchTo(target.id, password);
      enter(target.id);
    } catch (caught) {
      setError(messageOf(caught, "Could not switch workspace."));
      setIsSwitching(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-sm">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Switch to {target?.name}</DialogTitle>
            <DialogDescription>
              Your account in {target?.name} is separate from this one. Enter its password to
              continue — you will be signed out of this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="switch-password">Password for {target?.name}</Label>
              <Input
                id="switch-password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" disabled={isSwitching} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!password || isSwitching}>
              {isSwitching ? <Loader2 className="animate-spin" /> : <LogIn />}
              Switch
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
