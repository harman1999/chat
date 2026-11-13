"use client";

import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AppLogo } from "@/components/common";
import { Button } from "@/components/ui/button";
import { reloadAs } from "@/lib/navigation";
import { authService, type TwoFactorSetup } from "@/services/authService";
import { isApiError } from "@/services/http";
import { CodeField, RecoveryCodes, SecretPanel } from "./two-factor-parts";

export interface SecondStep {
  challenge: string;
  /** `verify`: they have it set up. `enrol`: the workspace requires it and they do not yet. */
  mode: "verify" | "enrol";
}

/**
 * What follows a correct password when two-factor is on: a code from the app, or —
 * where the workspace requires it and this person has not set it up — setting it up
 * first. No session exists until this is done; the challenge from the password step
 * is all that connects the two.
 */
export function TwoFactorStep({ step, next, onBack }: { step: SecondStep; next: string; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  const fail = (caught: unknown, fallback: string) => {
    if (isApiError(caught) && caught.code === "challenge_expired") setExpired(true);
    setError(isApiError(caught) ? caught.message : fallback);
  };

  // Enrolling: fetch the secret as soon as this screen opens.
  useEffect(() => {
    if (step.mode !== "enrol") return;
    let cancelled = false;
    authService
      .startTwoFactorEnrolment(step.challenge)
      .then((result) => !cancelled && setSetup(result))
      .catch((caught) => !cancelled && fail(caught, "Could not start setup. Go back and try again."));
    return () => {
      cancelled = true;
    };
  }, [step.challenge, step.mode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      if (step.mode === "verify") {
        await authService.verifyTwoFactor(step.challenge, code);
        reloadAs(next);
      } else {
        const result = await authService.finishTwoFactorEnrolment(step.challenge, code);
        // They are signed in now, but the recovery codes are shown once — hold
        // the redirect until they have been saved.
        setRecoveryCodes(result.recoveryCodes);
        setIsBusy(false);
      }
    } catch (caught) {
      setIsBusy(false);
      setCode("");
      fail(caught, "Could not check that code. Try again.");
    }
  };

  const verifying = step.mode === "verify";
  const heading = recoveryCodes
    ? "Save your recovery codes"
    : verifying
      ? "Two-factor authentication"
      : "Set up two-factor authentication";

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-11 place-items-center rounded-xl bg-accent text-accent-fg shadow-sm">
            <AppLogo className="size-6" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-fg">{heading}</h1>
          {!recoveryCodes && (
            <p className="mt-1 text-sm text-fg-muted">
              {verifying
                ? "Enter the 6-digit code from your authenticator app."
                : "Your workspace requires it. Add Helix to an authenticator app, then enter the code it shows."}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          {recoveryCodes ? (
            <RecoveryCodes codes={recoveryCodes} doneLabel="Continue to Helix" onDone={() => reloadAs(next)} />
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {!verifying &&
                (setup ? (
                  <SecretPanel qr={setup.qr} secret={setup.secret} />
                ) : (
                  !expired && (
                    <p className="flex items-center gap-2 text-sm text-fg-muted">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Preparing your code…
                    </p>
                  )
                ))}

              {(verifying || setup) && (
                <CodeField
                  id="two-factor-code"
                  label={verifying ? "Authentication code" : "Code from the app"}
                  value={code}
                  onChange={(value) => {
                    setCode(value);
                    setError(null);
                  }}
                  allowRecovery={verifying}
                  autoFocus
                />
              )}

              {error && (
                <p role="alert" className="flex items-center gap-1.5 rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                  {error}
                </p>
              )}

              {!expired && (verifying || setup) && (
                <Button type="submit" variant="primary" size="lg" className="w-full" disabled={isBusy || code.trim().length < 6}>
                  {isBusy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                  {verifying ? "Verify" : "Turn on and sign in"}
                </Button>
              )}
              {verifying && (
                <p className="text-center text-2xs text-fg-subtle">
                  Lost your phone? Enter one of your recovery codes instead.
                </p>
              )}
            </form>
          )}
        </div>

        {!recoveryCodes && (
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={onBack}>
            {expired ? "Back to sign in" : "Use a different account"}
          </Button>
        )}
      </div>
    </main>
  );
}
