"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteService } from "@/services";
import { isApiError } from "@/services/http";

/** Mirrors the server's minimum, so the error shows before submitting. */
const MIN_PASSWORD_LENGTH = 12;

export function JoinWorkspace({ token }: { token: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<{ message: string; canSignIn: boolean } | null>(null);

  const { data: invite, isPending, error: linkError } = useQuery({
    queryKey: ["invite-preview", token],
    queryFn: () => inviteService.preview(token),
    retry: false,
  });

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !isJoining;

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsJoining(true);
    setError(null);
    try {
      await inviteService.accept(token, { fullName: fullName.trim(), email: email.trim(), password });
      // The server has signed them in, so straight to the workspace.
      router.push("/workspace");
      router.refresh();
    } catch (caught) {
      const code = isApiError(caught) ? caught.code : "";
      setError({
        message: isApiError(caught) ? caught.message : "Could not join. Please try again.",
        canSignIn: code === "email_taken",
      });
      setIsJoining(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-sm">
        {isPending ? (
          <div className="flex items-center gap-2 px-6 py-10 text-sm text-fg-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Checking your invite…
          </div>
        ) : linkError || !invite ? (
          <div className="px-6 py-8">
            <AlertTriangle className="size-5 text-danger" aria-hidden />
            <h1 className="mt-2 text-md font-semibold text-fg">This invite can&apos;t be used</h1>
            <p className="mt-1 text-sm text-fg-muted">
              {isApiError(linkError) ? linkError.message : "The invite link is not valid."}
            </p>
            <Button variant="secondary" size="sm" className="mt-4" asChild>
              <Link href="/login">Go to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={join}>
            <header className="border-b border-border px-6 py-5">
              <span className="grid size-9 place-items-center rounded-lg bg-accent-subtle text-accent">
                <UserPlus className="size-4.5" aria-hidden />
              </span>
              <h1 className="mt-3 text-lg font-semibold tracking-tight text-fg">
                Join {invite.workspaceName}
              </h1>
              <p className="mt-1 text-sm text-fg-muted">
                <strong className="font-medium text-fg">{invite.invitedByName}</strong> invited you.
                Choose your details to create your account.
              </p>
            </header>

            <div className="space-y-4 px-6 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="join-name">Full name</Label>
                <Input
                  id="join-name"
                  autoFocus
                  autoComplete="name"
                  value={fullName}
                  maxLength={120}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="join-email">Email</Label>
                <Input
                  id="join-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  maxLength={254}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="join-password">Password</Label>
                <Input
                  id="join-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  maxLength={200}
                  aria-invalid={passwordTooShort}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <p className={passwordTooShort ? "text-2xs text-danger" : "text-2xs text-fg-subtle"}>
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              </div>

              {error && (
                <p role="alert" className="rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                  {error.message}{" "}
                  {error.canSignIn && (
                    <Link href="/login" className="font-medium underline">
                      Sign in
                    </Link>
                  )}
                </p>
              )}
            </div>

            <footer className="border-t border-border px-6 py-4">
              <Button type="submit" variant="primary" size="sm" className="w-full" disabled={!canSubmit}>
                {isJoining && <Loader2 className="animate-spin" />}
                Join {invite.workspaceName}
              </Button>
            </footer>
          </form>
        )}
      </div>
    </main>
  );
}
