"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, Loader2, RefreshCw } from "lucide-react";
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

/** Mirrors the server's grammar, so the error shows before submit rather than after. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
/** Mirrors `createUserSchema`; the two minimums must not disagree. */
const MIN_PASSWORD_LENGTH = 12;

/** "Ada Lovelace" -> "ada.lovelace", matching the server's own derivation. */
function usernameFrom(fullName: string): string {
  return fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function generatePassword(): string {
  // Avoids look-alike characters, because this password gets read aloud or
  // retyped rather than pasted from a mail client.
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(20));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function AddMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: roles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => adminService.listRoles(),
    enabled: open,
  });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [title, setTitle] = useState("");
  const [roleId, setRoleId] = useState("role_member");
  const [password, setPassword] = useState(generatePassword);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived during render rather than synced in an effect: the field shows what
  // the server would derive until the administrator types their own.
  const effectiveUsername = username.trim() || usernameFrom(fullName);

  const usernameError =
    effectiveUsername.length > 0 && !USERNAME_PATTERN.test(effectiveUsername)
      ? "Use lowercase letters, numbers, dots, hyphens and underscores."
      : null;
  const passwordError =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `At least ${MIN_PASSWORD_LENGTH} characters.`
      : null;

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    effectiveUsername.length > 0 &&
    !usernameError &&
    !passwordError &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !isSaving;

  const reset = () => {
    setFullName("");
    setEmail("");
    setUsername("");
    setTitle("");
    setRoleId("role_member");
    setPassword(generatePassword());
    setError(null);
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Password copied");
    } catch {
      toast.error("Could not copy", { description: "Select the field and copy manually." });
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    setError(null);
    try {
      const created = await adminService.createUser({
        email: email.trim(),
        fullName: fullName.trim(),
        password,
        username: effectiveUsername,
        roleId,
        title: title.trim(),
        channels: ["general"],
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Account created", {
        description: `${created.displayName} can sign in with the password you set.`,
      });
      onOpenChange(false);
      reset();
    } catch (caught) {
      // The API names which field is wrong — a duplicate address and a taken
      // username need different corrections, so show its message rather than
      // one generic line.
      setError(
        isApiError(caught) ? caught.message : "Could not create the account. Please try again.",
      );
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
          <DialogTitle>Add a member</DialogTitle>
          <DialogDescription>
            This creates the account directly. There is no email being sent, so pass the password on
            yourself.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto scrollbar-thin px-5 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="member-name">Full name</Label>
              <Input
                id="member-name"
                autoFocus
                value={fullName}
                maxLength={120}
                placeholder="Ada Lovelace"
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                maxLength={254}
                placeholder="ada@northwind.io"
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="member-username">Username</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">
                  @
                </span>
                <Input
                  id="member-username"
                  value={username}
                  maxLength={40}
                  placeholder={usernameFrom(fullName) || "ada.lovelace"}
                  aria-invalid={Boolean(usernameError)}
                  aria-describedby={usernameError ? "member-username-error" : undefined}
                  onChange={(event) => setUsername(event.target.value)}
                  className="pl-7"
                />
              </div>
              {usernameError ? (
                <p id="member-username-error" className="text-2xs text-danger">
                  {usernameError}
                </p>
              ) : (
                <p className="text-2xs text-fg-subtle">Derived from the name when left blank.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="member-title">Job title</Label>
              <Input
                id="member-title"
                value={title}
                maxLength={120}
                placeholder="Principal Engineer"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="member-role">Role</Label>
              {/* A real <select>: the list is short, and the native control
                  gets keyboard and mobile behaviour for free. Only the chrome
                  is replaced, so it matches Input rather than the browser. */}
              <div className="relative">
                <select
                  id="member-role"
                  value={roleId}
                  onChange={(event) => setRoleId(event.target.value)}
                  className="h-8 w-full appearance-none rounded-md border border-border bg-surface pl-2.5 pr-8 text-sm text-fg shadow-xs transition-colors hover:border-border-strong focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[color-mix(in_oklch,var(--accent)_35%,transparent)]"
                >
                  {(roles ?? [{ id: "role_member", name: "Member" }]).map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
                  aria-hidden
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="member-password">First password</Label>
              <div className="flex gap-1.5">
                <Input
                  id="member-password"
                  value={password}
                  maxLength={200}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby="member-password-hint"
                  onChange={(event) => setPassword(event.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Generate a new password"
                  onClick={() => setPassword(generatePassword())}
                  className="h-8 w-8 shrink-0"
                >
                  <RefreshCw />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Copy password"
                  onClick={() => void copyPassword()}
                  className="h-8 w-8 shrink-0"
                >
                  <Copy />
                </Button>
              </div>
              <p id="member-password-hint" className="text-2xs text-fg-subtle">
                {passwordError ?? "Shown once. Copy it before you close this dialog."}
              </p>
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
            <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
              {isSaving && <Loader2 className="animate-spin" />}
              Create account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
