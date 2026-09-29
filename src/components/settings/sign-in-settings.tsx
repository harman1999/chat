"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/hooks";
import { userService } from "@/services";
import { isApiError } from "@/services/http";
import { SettingRow, SettingSection } from "./setting-primitives";

function EmailSection() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const [draft, setDraft] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = user?.email ?? "";
  // Null until edited, so the field shows the current address and can still
  // be cleared to type a new one.
  const value = draft ?? current;
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const isDirty = value.trim().toLowerCase() !== current.toLowerCase();

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const { email } = await userService.changeEmail(value.trim(), password);
      await queryClient.invalidateQueries({ queryKey: ["current-user"] });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setDraft(null);
      setPassword("");
      toast.success("Email updated", { description: `Sign in with ${email} from now on.` });
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Could not change your email. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingRow
      label="Email address"
      description="What you sign in with. Changing it takes effect straight away."
      htmlFor="account-email"
    >
      <div className="max-w-md space-y-2">
        <Input
          id="account-email"
          type="email"
          autoComplete="email"
          value={value}
          aria-invalid={isDirty && !isValid}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
        />
        {isDirty && !isValid && (
          <p className="flex items-center gap-1 text-2xs text-danger">
            <AlertTriangle className="size-3" aria-hidden />
            Enter a valid email address.
          </p>
        )}
        {isDirty && isValid && (
          <div className="space-y-2 rounded-md border border-border bg-surface-subtle p-3">
            <Label htmlFor="account-email-password" className="text-xs">
              Current password
            </Label>
            <Input
              id="account-email-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
            />
            <p className="text-2xs text-fg-subtle">
              To confirm it is you. After this, sign in with{" "}
              <span className="font-medium text-fg">{value.trim()}</span>.
            </p>
            {error && (
              <p role="alert" className="rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={!password || isSaving}
                onClick={() => void save()}
              >
                {isSaving && <Loader2 className="animate-spin" />}
                Change email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isSaving}
                onClick={() => {
                  setDraft(null);
                  setPassword("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </SettingRow>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = next.length > 0 && next.length < 12;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = current.length > 0 && next.length >= 12 && confirm === next && !isSaving;

  return (
    <SettingRow label="Password" description="At least 12 characters.">
      <div className="grid max-w-md gap-2.5">
        <Input
          type="password"
          value={current}
          placeholder="Current password"
          aria-label="Current password"
          autoComplete="current-password"
          onChange={(event) => {
            setCurrent(event.target.value);
            setError(null);
          }}
        />
        <div>
          <Input
            type="password"
            value={next}
            placeholder="New password"
            aria-label="New password"
            autoComplete="new-password"
            aria-invalid={tooShort}
            onChange={(event) => setNext(event.target.value)}
          />
          {tooShort && (
            <p className="mt-1 text-2xs text-danger">Passwords must be at least 12 characters.</p>
          )}
        </div>
        <div>
          <Input
            type="password"
            value={confirm}
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            autoComplete="new-password"
            aria-invalid={mismatch}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {mismatch && <p className="mt-1 text-2xs text-danger">Passwords do not match.</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
            {error}
          </p>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="justify-self-start"
          disabled={!canSubmit}
          onClick={async () => {
            setIsSaving(true);
            setError(null);
            try {
              await userService.changePassword(current, next);
              setCurrent("");
              setNext("");
              setConfirm("");
              toast.success("Password changed", {
                description: "You stay signed in here; everywhere else is signed out.",
              });
            } catch (caught) {
              setError(isApiError(caught) ? caught.message : "Could not change your password. Try again.");
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {isSaving && <Loader2 className="animate-spin" />}
          Change password
        </Button>
      </div>
    </SettingRow>
  );
}

/** Email and password, shown at the foot of the Profile page. */
export function SignInSettings() {
  return (
    <SettingSection title="Sign-in" description="The email and password you sign in with.">
      <EmailSection />
      <PasswordSection />
    </SettingSection>
  );
}
