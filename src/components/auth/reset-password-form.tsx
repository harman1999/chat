"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";
import { isApiError } from "@/services/http";
import { AuthShell } from "./auth-shell";

/** Mirrors the server's minimum, so the problem shows before submitting. */
const MIN_PASSWORD_LENGTH = 12;

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<{ message: string; linkIsDead: boolean } | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && confirm === password && !isSaving;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSaving(true);
    try {
      await authService.resetPassword(token, password);
      setIsDone(true);
    } catch (caught) {
      setError({
        message: isApiError(caught) ? caught.message : "Could not change the password. Try again in a moment.",
        linkIsDead: isApiError(caught) && caught.code === "invalid_token",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isDone) {
    return (
      <AuthShell title="Password changed">
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5 text-center shadow-sm">
          <CheckCircle2 className="mx-auto size-8 text-accent" aria-hidden />
          <p className="text-sm text-fg">
            Your password is changed, and you were signed out everywhere. Sign in with the new one.
          </p>
        </div>
        <Button asChild variant="primary" size="lg" className="mt-3 w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form
        onSubmit={submit}
        className="space-y-3.5 rounded-xl border border-border bg-surface p-5 shadow-sm"
      >
        <div className="space-y-1.5">
          <Label htmlFor="reset-password">New password</Label>
          <Input
            id="reset-password"
            type="password"
            value={password}
            autoComplete="new-password"
            required
            autoFocus
            aria-invalid={tooShort}
            onChange={(event) => setPassword(event.target.value)}
            className="h-9"
          />
          <p className={tooShort ? "text-2xs text-danger" : "text-2xs text-fg-subtle"}>
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reset-confirm">Type it again</Label>
          <Input
            id="reset-confirm"
            type="password"
            value={confirm}
            autoComplete="new-password"
            required
            aria-invalid={mismatch}
            onChange={(event) => setConfirm(event.target.value)}
            className="h-9"
          />
          {mismatch && <p className="text-2xs text-danger">The two passwords do not match.</p>}
        </div>

        {error && (
          <div
            role="alert"
            className="space-y-1.5 rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger"
          >
            <p className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              {error.message}
            </p>
            {error.linkIsDead && (
              <Link href="/forgot-password" className="font-medium underline">
                Send me a new link
              </Link>
            )}
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!canSubmit}>
          {isSaving && <Loader2 className="animate-spin" />}
          Change password
        </Button>
      </form>
    </AuthShell>
  );
}
