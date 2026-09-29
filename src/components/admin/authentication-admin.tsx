"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { SegmentedControl, SettingRow, SettingSection } from "@/components/settings";
import { Skeleton } from "@/components/ui/skeleton";
import { adminService } from "@/services";
import { isApiError } from "@/services/http";
import { AdminPage } from "./admin-page";

/** Mirrors the server, which refuses shorter passwords whoever sets them. */
const MIN_PASSWORD_LENGTH = 12;

const SESSION_CHOICES = [
  { value: 24, label: "24 hours" },
  { value: 168, label: "7 days" },
  { value: 720, label: "30 days" },
] as const;

/**
 * Sign-in policy: only what the application really does.
 *
 * Email and password is the one way in; there is no single sign-on or directory
 * sync to configure. The minimum length is fixed in the server, so it is
 * stated, not offered as a setting. Session length is real: it is stored on the
 * workspace and applied to every new sign-in.
 */
export function AuthenticationAdmin() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminService.settings(),
  });
  const [isSaving, setIsSaving] = useState(false);

  const current = data?.sessionTimeoutHours;
  // A value set some other way (the API accepts any 1–8760) still shows, as it is.
  const options = SESSION_CHOICES.some((choice) => choice.value === current) || !current
    ? [...SESSION_CHOICES]
    : [...SESSION_CHOICES, { value: current, label: `${current} hours` }].sort((a, b) => a.value - b.value);

  const change = async (hours: number) => {
    setIsSaving(true);
    try {
      await adminService.updateSettings({ sessionTimeoutHours: hours });
      await queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      toast.success("Session length saved", {
        description: "Applies to sign-ins from now on. Sessions already open keep their current expiry.",
      });
    } catch (error) {
      toast.error("Could not save the session length", {
        description: isApiError(error) ? error.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminPage title="Authentication" description="How people sign in to this workspace, and how long they stay signed in.">
      <div className="space-y-8">
        <SettingSection title="Sign-in" description="What people can use to get in.">
          <SettingRow
            label="Email and password"
            description="The only sign-in method. Single sign-on and directory sync are not available."
          />
        </SettingSection>

        <SettingSection title="Passwords" description="Rules every password has to meet.">
          <SettingRow
            label="Minimum length"
            description="Fixed. It applies to passwords people choose and to ones an administrator sets."
            control={<span className="text-sm font-medium tabular-nums text-fg">{MIN_PASSWORD_LENGTH} characters</span>}
          />
        </SettingSection>

        <SettingSection title="Sessions" description="How long a sign-in lasts.">
          <SettingRow
            label="Session length"
            description="After this long, the person has to sign in again. It applies to sign-ins from now on; sessions already open keep their current expiry."
            control={
              isPending ? (
                <Skeleton className="h-8 w-64 rounded-md" />
              ) : (
                <div className={isSaving ? "pointer-events-none opacity-60" : undefined}>
                  <SegmentedControl
                    ariaLabel="Session length"
                    value={String(current ?? 720)}
                    onChange={(value) => void change(Number(value))}
                    options={options.map((option) => ({ value: String(option.value), label: option.label }))}
                  />
                </div>
              )
            }
          />
        </SettingSection>
      </div>
    </AdminPage>
  );
}
