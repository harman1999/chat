"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppLogo } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";
import { APP } from "@/lib/constants";
import { USE_MOCK_TRANSPORT } from "@/services/http";

export function LoginForm({ next = "/workspace" }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("harman.singh@northwind.io");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await authService.signIn({ email, password });
      // refresh() makes the RSC request carry the freshly-set session cookie,
      // so the guarded page renders signed in rather than bouncing back here.
      router.push(next);
      router.refresh();
    } catch {
      setError("Email or password is incorrect.");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-11 place-items-center rounded-xl bg-accent text-accent-fg shadow-sm">
            <AppLogo className="size-6" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Sign in to {APP.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">Northwind Technologies</p>
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
