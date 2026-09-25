"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Laptop,
  Loader2,
  LogOut,
  Monitor,
  Smartphone,
  Tablet,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks";
import { userService } from "@/services";
import { formatRelative } from "@/lib/format";
import type { SessionDeviceKind } from "@/types";
import { SettingRow, SettingSection } from "./setting-primitives";

const DEVICE_ICON: Record<SessionDeviceKind, LucideIcon> = {
  desktop: Laptop,
  mobile: Smartphone,
  tablet: Tablet,
  web: Monitor,
};

function EmailSection() {
  const { data: user } = useCurrentUser();
  const [email, setEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const current = user?.email ?? "";
  const value = email || current;
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const isDirty = value !== current;

  return (
    <SettingRow
      label="Email address"
      description="Used for sign-in, notifications and password resets."
      htmlFor="account-email"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <Input
            id="account-email"
            type="email"
            value={value}
            aria-invalid={isDirty && !isValid}
            onChange={(event) => setEmail(event.target.value)}
            className="max-w-md"
          />
          {isDirty && !isValid && (
            <p className="mt-1 flex items-center gap-1 text-2xs text-danger">
              <AlertTriangle className="size-3" aria-hidden />
              Enter a valid email address.
            </p>
          )}
          {isDirty && isValid && (
            <p className="mt-1 text-2xs text-fg-subtle">
              We&apos;ll send a confirmation link before the change takes effect.
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!isDirty || !isValid || isSaving}
          onClick={async () => {
            setIsSaving(true);
            try {
              await userService.changeEmail(value);
              toast.success("Confirmation sent", { description: `Check ${value} to confirm.` });
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {isSaving && <Loader2 className="animate-spin" />}
          Update
        </Button>
      </div>
    </SettingRow>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const tooShort = next.length > 0 && next.length < 12;
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit = current.length > 0 && next.length >= 12 && confirm === next && !isSaving;

  return (
    <SettingRow label="Password" description="Use at least 12 characters, including a number.">
      <div className="grid max-w-md gap-2.5">
        <Input
          type="password"
          value={current}
          placeholder="Current password"
          aria-label="Current password"
          autoComplete="current-password"
          onChange={(event) => setCurrent(event.target.value)}
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
        <Button
          variant="secondary"
          size="sm"
          className="justify-self-start"
          disabled={!canSubmit}
          onClick={async () => {
            setIsSaving(true);
            try {
              await userService.changePassword(current, next);
              setCurrent("");
              setNext("");
              setConfirm("");
              toast.success("Password changed", { description: "Other sessions have been signed out." });
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

function SessionsSection() {
  const { data, isPending, refetch } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => userService.listSessions(),
  });
  const [revoking, setRevoking] = useState<string | null>(null);

  if (isPending) {
    return (
      <div className="space-y-3 p-4" aria-hidden>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-2.5 w-40 rounded-full" />
              <Skeleton className="h-2.5 w-56 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {data?.map((session) => {
        const Icon = DEVICE_ICON[session.deviceKind];
        return (
          <SettingRow
            key={session.id}
            label={session.deviceLabel}
            description={`${session.browser} · ${session.location} · ${session.ipAddress}`}
            control={
              session.isCurrent ? (
                <Badge variant="success">This device</Badge>
              ) : (
                <Button
                  variant="danger-ghost"
                  size="sm"
                  disabled={revoking === session.id}
                  onClick={async () => {
                    setRevoking(session.id);
                    try {
                      await userService.revokeSession(session.id);
                      await refetch();
                      toast.success("Session signed out", { description: session.deviceLabel });
                    } finally {
                      setRevoking(null);
                    }
                  }}
                >
                  {revoking === session.id ? <Loader2 className="animate-spin" /> : <LogOut />}
                  Sign out
                </Button>
              )
            }
          >
            <p className="flex items-center gap-1.5 text-2xs text-fg-subtle">
              <Icon className="size-3.5" aria-hidden />
              Last active {formatRelative(session.lastActiveAt)}
            </p>
          </SettingRow>
        );
      })}
    </>
  );
}

export function AccountSettings() {
  const [isRevokingAll, setIsRevokingAll] = useState(false);

  return (
    <>
      <SettingSection title="Account" description="Sign-in details for your Helix account.">
        <EmailSection />
        <PasswordSection />

      </SettingSection>

      <SettingSection
        title="Active sessions"
        description="Devices currently signed in to your account."
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={isRevokingAll}
            onClick={async () => {
              setIsRevokingAll(true);
              try {
                await userService.revokeOtherSessions();
                toast.success("Signed out everywhere else");
              } finally {
                setIsRevokingAll(false);
              }
            }}
          >
            {isRevokingAll && <Loader2 className="animate-spin" />}
            Sign out others
          </Button>
        }
      >
        <SessionsSection />
      </SettingSection>


    </>
  );
}
