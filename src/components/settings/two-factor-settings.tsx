"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CodeField, RecoveryCodes, SecretPanel } from "@/components/auth/two-factor-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { userService } from "@/services";
import { isApiError } from "@/services/http";
import { SettingRow } from "./setting-primitives";

type Panel =
  | { kind: "none" }
  | { kind: "password" }
  | { kind: "scan"; secret: string; qr: string }
  | { kind: "codes"; codes: string[] }
  | { kind: "confirm"; action: "disable" | "regenerate" };

const errorText = (caught: unknown, fallback: string) => (isApiError(caught) ? caught.message : fallback);

/** Turn two-factor sign-in on or off, and manage the recovery codes. Lives in Settings → Profile → Sign-in. */
export function TwoFactorSection() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["two-factor"], queryFn: () => userService.twoFactorStatus() });
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["two-factor"] });
  const close = () => {
    setPanel({ kind: "none" });
    setPassword("");
    setCode("");
    setError(null);
  };

  const run = async (work: () => Promise<void>, fallback: string) => {
    setIsBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(errorText(caught, fallback));
    } finally {
      setIsBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const setup = await userService.startTwoFactor(password);
      setPassword("");
      setPanel({ kind: "scan", secret: setup.secret, qr: setup.qr });
    }, "Could not start setup. Try again.");

  const enable = () =>
    run(async () => {
      const { recoveryCodes } = await userService.enableTwoFactor(code);
      setCode("");
      await refresh();
      setPanel({ kind: "codes", codes: recoveryCodes });
    }, "Could not turn on two-factor. Try again.");

  const confirm = (action: "disable" | "regenerate") =>
    run(async () => {
      if (action === "disable") {
        await userService.disableTwoFactor(password, code);
        await refresh();
        close();
        toast.success("Two-factor turned off", { description: "You can sign in with just your password again." });
      } else {
        const { recoveryCodes } = await userService.regenerateRecoveryCodes(password, code);
        await refresh();
        setPassword("");
        setCode("");
        setPanel({ kind: "codes", codes: recoveryCodes });
      }
    }, "Could not complete that. Try again.");

  const enabled = data?.enabled ?? false;
  const low = enabled && (data?.recoveryCodesLeft ?? 0) <= 3;

  return (
    <SettingRow
      label="Two-factor authentication"
      description="Sign in with a 6-digit code from an authenticator app as well as your password, so a stolen password is not enough."
      control={
        isPending ? (
          <Skeleton className="h-8 w-24 rounded-md" />
        ) : panel.kind === "none" ? (
          enabled ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <ShieldCheck className="size-4" aria-hidden />
              On
            </span>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setPanel({ kind: "password" })}>
              <ShieldCheck />
              Turn on
            </Button>
          )
        ) : undefined
      }
    >
      {enabled && panel.kind === "none" && (
        <div className="mt-3 space-y-3">
          <p className={low ? "flex items-center gap-1.5 text-xs text-warning" : "text-xs text-fg-muted"}>
            {low && <AlertTriangle className="size-3.5" aria-hidden />}
            {data?.recoveryCodesLeft ?? 0} recovery code{data?.recoveryCodesLeft === 1 ? "" : "s"} left
            {low ? " — make a new set before you run out." : "."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPanel({ kind: "confirm", action: "regenerate" })}>
              New recovery codes
            </Button>
            {data?.required ? (
              <span className="self-center text-2xs text-fg-subtle">Your workspace requires it, so it cannot be turned off.</span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setPanel({ kind: "confirm", action: "disable" })}>
                <ShieldOff />
                Turn off
              </Button>
            )}
          </div>
        </div>
      )}

      {panel.kind === "password" && (
        <form
          className="mt-3 max-w-md space-y-3 rounded-md border border-border bg-surface-subtle p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="two-factor-start-password" className="text-xs">
              Current password
            </Label>
            <Input
              id="two-factor-start-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
            />
            <p className="text-2xs text-fg-subtle">To confirm it is you before showing the setup code.</p>
          </div>
          {error && <FormError message={error} />}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={!password || isBusy}>
              {isBusy && <Loader2 className="animate-spin" />}
              Continue
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {panel.kind === "scan" && (
        <form
          className="mt-3 max-w-lg space-y-4 rounded-md border border-border bg-surface-subtle p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void enable();
          }}
        >
          <ol className="list-decimal space-y-1 pl-4 text-xs text-fg-muted">
            <li>Open an authenticator app (Google Authenticator, 1Password, Authy…).</li>
            <li>Scan this code, or enter the key by hand.</li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          <SecretPanel qr={panel.qr} secret={panel.secret} />
          <div className="max-w-xs">
            <CodeField id="two-factor-enable-code" label="Code from the app" value={code} onChange={(value) => { setCode(value); setError(null); }} autoFocus />
          </div>
          {error && <FormError message={error} />}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={code.trim().length < 6 || isBusy}>
              {isBusy && <Loader2 className="animate-spin" />}
              Turn on
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {panel.kind === "codes" && (
        <div className="mt-3 max-w-md rounded-md border border-border bg-surface-subtle p-3">
          <RecoveryCodes codes={panel.codes} onDone={close} />
        </div>
      )}

      {panel.kind === "confirm" && (
        <form
          className="mt-3 max-w-md space-y-3 rounded-md border border-border bg-surface-subtle p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm(panel.action);
          }}
        >
          <p className="text-xs text-fg-muted">
            {panel.action === "disable"
              ? "Turning it off means a password is enough to sign in. Confirm with your password and a current code."
              : "The old codes stop working as soon as you make new ones. Confirm with your password and a current code."}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="two-factor-confirm-password" className="text-xs">
              Current password
            </Label>
            <Input
              id="two-factor-confirm-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="max-w-xs">
            <CodeField id="two-factor-confirm-code" label="Code from the app, or a recovery code" value={code} onChange={(value) => { setCode(value); setError(null); }} allowRecovery />
          </div>
          {error && <FormError message={error} />}
          <div className="flex gap-2">
            <Button
              type="submit"
              variant={panel.action === "disable" ? "danger" : "primary"}
              size="sm"
              disabled={!password || code.trim().length < 6 || isBusy}
            >
              {isBusy && <Loader2 className="animate-spin" />}
              {panel.action === "disable" ? "Turn off two-factor" : "Make new codes"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={isBusy} onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </SettingRow>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
      {message}
    </p>
  );
}
