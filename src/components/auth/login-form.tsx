"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
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

/** What the single sign-on callback sends back as `?sso_error=`, in words. */
const SSO_ERRORS: Record<string, string> = {
  not_configured: "Single sign-on is not set up for this workspace.",
  denied: "The sign-in was cancelled or refused by the provider.",
  expired: "That sign-in took too long or was already used. Please try again.",
  failed: "Single sign-on could not be completed. Try again, or ask an administrator.",
  no_email: "The provider did not share a verified email address, so we cannot match you to an account.",
  no_account: "No account matches that email. Ask an administrator to invite you.",
  domain_not_allowed: "That email address is not allowed to sign in here.",
  deactivated: "This account has been deactivated.",
};

export function LoginForm({
  next = "/workspace",
  workspace,
  ssoError,
}: {
  next?: string;
  /** Set when the link named a workspace; otherwise it is worked out from the email. */
  workspace?: WorkspaceChoice;
  /** From `?sso_error=` after a failed single sign-on attempt. */
  ssoError?: string;
}) {
  const [email, setEmail] = useState("harman.singh@northwind.io");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(ssoError ? (SSO_ERRORS[ssoError] ?? SSO_ERRORS.failed) : null);
  const { data: sso } = useQuery({
    queryKey: ["sso-options", workspace?.slug ?? null],
    queryFn: () => authService.ssoOptions(workspace?.slug),
    retry: false,
    staleTime: 60_000,
  });
  // When single sign-on is required, the password form is for the owner only,
  // so it stays out of the way until asked for.
  const [showPassword, setShowPassword] = useState(false);
  const passwordFormVisible = !sso?.enforced || showPassword;
  const ssoHref = `/api/v1/auth/sso/start?next=${encodeURIComponent(next)}${workspace ? `&workspace=${encodeURIComponent(workspace.slug)}` : ""}`;
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

        {sso?.enabled && (
          <div className="mb-3 space-y-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
            <Button asChild variant="primary" size="lg" className="w-full">
              <a href={ssoHref}>
                <KeyRound />
                Sign in with {sso.label}
              </a>
            </Button>
            {error && !passwordFormVisible && (
              <p
                role="alert"
                className="flex items-center gap-1.5 rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger"
              >
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            )}
            {sso.enforced && !showPassword && (
              <button
                type="button"
                onClick={() => setShowPassword(true)}
                className="block w-full text-center text-2xs text-fg-subtle hover:text-fg hover:underline"
              >
                Owner sign-in with a password
              </button>
            )}
          </div>
        )}

        {passwordFormVisible && (
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
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">Password</Label>
              <Link href="/forgot-password" className="text-2xs font-medium text-accent hover:underline">
                Forgot password?
              </Link>
            </div>
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
        </form>
        )}

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
