"use client";

import { AlertTriangle, ArrowLeft, Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";
import { isApiError } from "@/services/http";
import { AuthShell } from "./auth-shell";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSending(true);
    try {
      await authService.forgotPassword(email.trim());
      setSentTo(email.trim());
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Could not send the email. Try again in a moment.");
    } finally {
      setIsSending(false);
    }
  };

  if (sentTo) {
    return (
      <AuthShell title="Check your email">
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5 text-center shadow-sm">
          <MailCheck className="mx-auto size-8 text-accent" aria-hidden />
          <p className="text-sm text-fg">
            If <span className="font-medium">{sentTo}</span> has an account, a link to choose a new
            password is on its way.
          </p>
          <p className="text-2xs text-fg-subtle">The link works once and expires in an hour.</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="mt-3 w-full">
          <Link href="/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="We will email you a link to choose a new one.">
      <form
        onSubmit={submit}
        className="space-y-3.5 rounded-xl border border-border bg-surface p-5 shadow-sm"
      >
        <div className="space-y-1.5">
          <Label htmlFor="forgot-email">Email address</Label>
          <Input
            id="forgot-email"
            type="email"
            value={email}
            autoComplete="email"
            required
            autoFocus
            onChange={(event) => setEmail(event.target.value)}
            className="h-9"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-center gap-1.5 rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger"
          >
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isSending || !email}>
          {isSending && <Loader2 className="animate-spin" />}
          Send reset link
        </Button>
      </form>
      <Button asChild variant="ghost" size="sm" className="mt-3 w-full">
        <Link href="/login">
          <ArrowLeft /> Back to sign in
        </Link>
      </Button>
    </AuthShell>
  );
}
