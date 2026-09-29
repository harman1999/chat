"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminService } from "@/services";
import { isApiError } from "@/services/http";
import type { Role } from "@/types";

export function CreateRoleDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Member is the sensible starting point: a new role is nearly always
  // "like Member, plus something".
  // Null until chosen, meaning Member — found by kind, since its id differs
  // between workspaces.
  const [chosenCopyFrom, setCopyFrom] = useState<string | null>(null);
  const copyFrom = chosenCopyFrom ?? roles.find((role) => role.kind === "member")?.id ?? "";
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setCopyFrom(null);
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const role = await adminService.createRole({
        name: name.trim(),
        description: description.trim(),
        copyFromRoleId: copyFrom || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      toast.success("Role created", {
        description: `${role.name} · ${role.permissionIds.length} permissions`,
      });
      onOpenChange(false);
      reset();
    } catch (caught) {
      // Shown in the form, against the field that caused it, rather than as a
      // toast that disappears before it is read.
      setError(isApiError(caught) ? caught.message : "Could not create the role.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create a role</DialogTitle>
          <DialogDescription>
            A role is a named set of permissions. You can change which permissions it has
            afterwards.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input
                id="role-name"
                autoFocus
                value={name}
                maxLength={60}
                placeholder="Reviewer"
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-description">Description</Label>
              <Input
                id="role-description"
                value={description}
                maxLength={200}
                placeholder="Can moderate channels but not manage people"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-copy">Start with the permissions of</Label>
              <div className="relative">
                <select
                  id="role-copy"
                  value={copyFrom}
                  onChange={(event) => setCopyFrom(event.target.value)}
                  className="h-8 w-full appearance-none rounded-md border border-border bg-surface pl-2.5 pr-8 text-sm text-fg shadow-xs transition-colors hover:border-border-strong focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[color-mix(in_oklch,var(--accent)_35%,transparent)]"
                >
                  <option value="">Nothing — start empty</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} ({role.permissionIds.length} permissions)
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
                  aria-hidden
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!name.trim() || isSaving}>
              {isSaving && <Loader2 className="animate-spin" />}
              Create role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
