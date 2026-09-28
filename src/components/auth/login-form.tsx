"use client";

import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { AppLogo } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";
import type { WorkspaceChoice } from "@/services/authService";
import { APP } from "@/lib/constants";
import { initialsOf } from "@/lib/format";
import { reloadAs } from "@/lib/navigation";
import { isApiError, USE_MOCK_TRANSPORT } from "@/services/http";

export function LoginForm({
  next = "/workspace",
  workspace,
}: {
  next?: string;
  /** Set when the link named a workspace; otherwise it is worked out from the email. */
  workspace?: WorkspaceChoice;
}) {
  const [email, setEmail] = useState("harman.singh@northwind.io");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Filled when the email has accounts in several workspaces and the password
  // matched more than one: the person picks which to enter.
  const [choices, setChoices] = useState<WorkspaceChoice[] | null>(null);

  const signIn = async (slug?: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await authService.signIn({ email, password, workspace: slug });
      reloadAs(next);
    } catch (caught) {
      setIsSubmitting(false);
      if (isApiError(caught) && caught.code === "choose_workspace") {
        setChoices((caught.details?.workspaces as WorkspaceChoice[] | undefined) ?? []);
        return;
      }
      // The server's own words for a deactivated account or too many
      // attempts; one generic line for a wrong email or password.
      setError(
        isApiError(caught) && caught.status !== 401 ? caught.message : "Email or password is incorrect.",
      );
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void signIn(workspace?.slug);
  };

  if (choices) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-3 grid size-11 place-items-center rounded-xl bg-accent text-accent-fg shadow-sm">
              <AppLogo className="size-6" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Choose a workspace</h1>
            <p className="mt-1 text-sm text-fg-muted">
              <span className="font-medium text-fg">{email}</span> has an account in each of these.
            </p>
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-surface p-3 shadow-sm">
            {choices.map((choice) => (
              <button
                key={choice.slug}
                type="button"
                disabled={isSubmitting}
                onClick={() => void signIn(choice.slug)}
                className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-surface-hover disabled:opacity-60"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-active text-2xs font-bold text-fg-muted"
                  aria-hidden
                >
                  {initialsOf(choice.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{choice.name}</span>
                  <span className="block truncate text-2xs text-fg-subtle">{choice.slug}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              </button>
            ))}
            {error && (
              <p role="alert" className="rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              setChoices(null);
              setPassword("");
            }}
          >
            Use a different account
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-11 place-items-center rounded-xl bg-accent text-accent-fg shadow-sm">
            <AppLogo className="size-6" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Sign in to {APP.name}</h1>
          {workspace && <p className="mt-1 text-sm text-fg-muted">{workspace.name}</p>}
        </div>

        <form
          onSubmit={submit}
          className="space-y-3.5 rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email address</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              autoComplete="username"
              required
              onChange={(event) => setEmail(event.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(event) => setPassword(event.target.value)}
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

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={isSubmitting || !email || !password}
          >
            {isSubmitting && <Loader2 className="animate-spin" />}
            Sign in
          </Button>

          <p className="text-center text-2xs text-fg-subtle">
            Single sign-on through Okta is configured for this workspace.
          </p>
        </form>

        {/* Seeded credentials, shown only while running against local fixtures. */}
        {!USE_MOCK_TRANSPORT && (
          <p className="mt-4 rounded-md border border-border bg-surface-subtle px-3 py-2 text-center text-2xs text-fg-muted">
            Demo account: <span className="font-mono">harman.singh@northwind.io</span> ·{" "}
            <span className="font-mono">helix-demo-password</span>
          </p>
        )}
      </div>
    </main>
  );
}
