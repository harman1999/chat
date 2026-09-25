"use client";

import { Camera, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks";
import { TIMEZONES } from "@/config";
import { userService } from "@/services";
import { useSettingsStore } from "@/store";
import { SettingRow, SettingSection, SettingSelect } from "./setting-primitives";
import { StatusControl } from "./status-control";

export function ProfileSettings() {
  const { data: user } = useCurrentUser();
  const timezone = useSettingsStore((state) => state.timezone);

  const [form, setForm] = useState({ displayName: "", fullName: "", title: "", department: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [seededFor, setSeededFor] = useState<string | null>(null);

  // Seed the form once the profile arrives. Derived during render rather than
  // in an effect, so the inputs are never briefly empty, and never while the
  // user has unsaved edits.
  if (user && seededFor !== user.id && !isDirty) {
    setSeededFor(user.id);
    setForm({
      displayName: user.displayName,
      fullName: user.fullName,
      title: user.title,
      department: user.department,
    });
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setIsDirty(true);
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await userService.updateProfile({ ...form, timezone });
      setIsDirty(false);
      toast.success("Profile updated", { description: "Your teammates will see the changes." });
    } catch {
      toast.error("Could not save profile", { description: "Check your connection and try again." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <SettingSection
        title="Profile"
        description="How you appear to everyone in this workspace."
        action={
          <Button variant="primary" size="sm" disabled={!isDirty || isSaving} onClick={() => void save()}>
            {isSaving && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        }
      >
        <SettingRow label="Photo" description="PNG or JPG, at least 256×256 and under 2 MB.">
          <div className="flex items-center gap-3">
            <UserAvatar user={user} size="xl" showPresence />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm">
                <Camera />
                Upload photo
              </Button>
              <Button variant="ghost" size="sm">
                Remove
              </Button>
            </div>
          </div>
        </SettingRow>

        <SettingRow
          label="Display name"
          description="Shown on your messages and in the member list."
          htmlFor="profile-display-name"
        >
          <Input
            id="profile-display-name"
            value={form.displayName}
            maxLength={64}
            onChange={(event) => update("displayName", event.target.value)}
            className="max-w-md"
          />
        </SettingRow>

        <SettingRow label="Full name" description="Visible on your profile card." htmlFor="profile-full-name">
          <Input
            id="profile-full-name"
            value={form.fullName}
            maxLength={96}
            onChange={(event) => update("fullName", event.target.value)}
            className="max-w-md"
          />
        </SettingRow>

        <SettingRow label="Job title" htmlFor="profile-title">
          <Input
            id="profile-title"
            value={form.title}
            maxLength={96}
            onChange={(event) => update("title", event.target.value)}
            className="max-w-md"
          />
        </SettingRow>

        <SettingRow label="Team" htmlFor="profile-department">
          <Input
            id="profile-department"
            value={form.department}
            maxLength={96}
            onChange={(event) => update("department", event.target.value)}
            className="max-w-md"
          />
        </SettingRow>

        <SettingRow
          label="Username"
          description="Used for @mentions. Contact an administrator to change it."
          control={
            <span className="rounded-md border border-border bg-surface-subtle px-2 py-1 font-mono text-xs text-fg-muted">
              @{user.username}
            </span>
          }
        />

        <SettingRow
          label="Local time"
          description="Teammates see this on your profile so they know when you're around."
          htmlFor="profile-timezone"
          control={
            <SettingSelect
              id="profile-timezone"
              value={timezone}
              onChange={(event) => {
                useSettingsStore.getState().setTimezone(event.target.value);
                setIsDirty(true);
              }}
            >
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace("_", " ")}
                </option>
              ))}
            </SettingSelect>
          }
        />
      </SettingSection>

      <SettingSection title="Status" description="Let people know what you're up to.">
        <SettingRow label="Current status" description="Clears automatically when it expires.">
          <StatusControl />
        </SettingRow>
      </SettingSection>
    </>
  );
}
