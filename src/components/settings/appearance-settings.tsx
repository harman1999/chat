"use client";

import { AlignJustify, Monitor, Moon, Rows3, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { UserAvatar } from "@/components/common";
import { MessageBody } from "@/components/messages/message-body";
import { ReactionBar } from "@/components/messages/reaction-bar";
import { useCurrentUser, useMounted, usePreferences } from "@/hooks";
import { useUsers } from "@/hooks";
import { cn } from "@/lib/utils";
import type { Density, ThemePreference } from "@/types";
import { SegmentedControl, SettingRow, SettingSection } from "./setting-primitives";

const THEME_OPTIONS: { value: ThemePreference; label: string; preview: string }[] = [
  { value: "light", label: "Light", preview: "bg-white" },
  { value: "dark", label: "Dark", preview: "bg-[oklch(0.208_0.016_265)]" },
  { value: "system", label: "System", preview: "bg-gradient-to-r from-white to-[oklch(0.208_0.016_265)]" },
];

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/** Live sample so density and theme choices are visible before leaving the page. */
function MessagePreview() {
  const { data: user } = useCurrentUser();
  // Any teammate will do — this is a rendering sample, not real content.
  const { data: directory } = useUsers();
  const other = directory?.find((candidate) => candidate.id !== user?.id);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex gap-2.5 px-3 py-[var(--message-gap-lg)]">
        {other && <UserAvatar user={other} size="lg" showPresence />}
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-fg">{other?.displayName ?? "Teammate"}</span>
            <span className="text-2xs text-fg-subtle">9:18 AM</span>
          </p>
          <MessageBody body="Monitoring dashboards are green across all three regions." />
          <ReactionBar
            reactions={[{ emoji: "👍", name: "thumbsup", userIds: [user?.id ?? "me"], count: 1 }]}
            currentUserId={user?.id ?? "me"}
            readOnly
          />
        </div>
      </div>
      <div className="flex gap-2.5 px-3 py-[var(--message-gap-lg)]">
        {user && <UserAvatar user={user} size="lg" showPresence />}
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-fg">{user?.displayName}</span>
            <span className="text-2xs text-fg-subtle">9:26 AM</span>
          </p>
          <MessageBody body="Agreed — let's push the schema migration to next week." />
        </div>
      </div>
    </div>
  );
}

export function AppearanceSettings() {
  const { setTheme: setNextTheme } = useTheme();
  const { preferences, setTheme, setDensity } = usePreferences();
  const mounted = useMounted();

  return (
    <>
      <SettingSection title="Theme" description="Applies to this device only.">
        <SettingRow label="Colour theme" description="System follows your operating system setting.">
          <div className="grid gap-2.5 sm:grid-cols-3">
            {THEME_OPTIONS.map((option) => {
              const Icon = THEME_ICON[option.value];
              const isActive = mounted && preferences.theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    setTheme(option.value);
                    setNextTheme(option.value);
                  }}
                  className={cn(
                    "rounded-lg border p-1.5 text-left transition-colors",
                    isActive
                      ? "border-accent ring-1 ring-inset ring-accent/35"
                      : "border-border hover:border-border-strong",
                  )}
                >
                  <span className={cn("block h-16 rounded-md border border-border", option.preview)} />
                  <span className="mt-1.5 flex items-center gap-1.5 px-1 pb-0.5 text-xs font-medium text-fg">
                    <Icon className="size-3.5 text-fg-subtle" aria-hidden />
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Density" description="How much breathing room messages get.">
        <SettingRow
          label="Message density"
          description="Compact tightens the spacing between messages."
          control={
            <SegmentedControl<Density>
              ariaLabel="Message density"
              value={preferences.density}
              onChange={setDensity}
              options={[
                { value: "comfortable", label: "Comfortable", icon: <Rows3 className="size-3.5" /> },
                { value: "compact", label: "Compact", icon: <AlignJustify className="size-3.5" /> },
              ]}
            />
          }
        />
        <SettingRow label="Preview" description="Reflects your current theme and density.">
          <MessagePreview />
        </SettingRow>
      </SettingSection>
    </>
  );
}
