"use client";

import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { LANGUAGES, TIMEZONES } from "@/config";
import { usePreferences } from "@/hooks";
import { SHORTCUTS, displayKey } from "@/lib/keyboard";
import { useSettingsStore, useUIStore } from "@/store";
import type { SendBehavior } from "@/types";
import {
  SegmentedControl,
  SettingRow,
  SettingSection,
  SettingSelect,
} from "./setting-primitives";

export function PreferencesSettings() {
  const { preferences, setLanguage, setTimezone, setMessagePreference } = usePreferences();
  const setShortcutsOpen = useUIStore((state) => state.setShortcutsOpen);
  const messages = preferences.messages;

  return (
    <>
      <SettingSection title="Language and region" description="Affects dates, times and the interface.">
        <SettingRow
          label="Language"
          htmlFor="pref-language"
          control={
            <SettingSelect
              id="pref-language"
              value={preferences.language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.label}
                </option>
              ))}
            </SettingSelect>
          }
        />
        <SettingRow
          label="Time zone"
          description="Used for timestamps and your local time on your profile."
          htmlFor="pref-timezone"
          control={
            <SettingSelect
              id="pref-timezone"
              value={preferences.timezone}
              onChange={(event) => setTimezone(event.target.value)}
            >
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace("_", " ")}
                </option>
              ))}
            </SettingSelect>
          }
        />
        <SettingRow
          label="24-hour time"
          description="Show 17:30 instead of 5:30 PM."
          htmlFor="pref-24h"
          control={
            <Switch
              id="pref-24h"
              checked={messages.use24HourTime}
              onCheckedChange={(checked) => setMessagePreference("use24HourTime", checked)}
            />
          }
        />
      </SettingSection>

      <SettingSection title="Messages" description="How the message list and composer behave.">
        <SettingRow
          label="Pressing Enter"
          description="Choose whether Enter sends a message or starts a new line."
          control={
            <SegmentedControl<SendBehavior>
              ariaLabel="Send behaviour"
              value={messages.sendBehavior}
              onChange={(value) => setMessagePreference("sendBehavior", value)}
              options={[
                { value: "enter", label: "Sends" },
                { value: "mod_enter", label: "New line" },
              ]}
            />
          }
        >
          <p className="flex flex-wrap items-center gap-1.5 text-2xs text-fg-subtle">
            {messages.sendBehavior === "enter" ? (
              <>
                <Kbd>Enter</Kbd> sends · <Kbd>⇧</Kbd>
                <Kbd>Enter</Kbd> starts a new line
              </>
            ) : (
              <>
                <Kbd>Enter</Kbd> starts a new line · <Kbd>{displayKey("Mod", false)}</Kbd>
                <Kbd>Enter</Kbd> sends
              </>
            )}
          </p>
        </SettingRow>

        <SettingRow
          label="Group consecutive messages"
          description="Collapse repeated names and avatars from the same person."
          htmlFor="pref-group"
          control={
            <Switch
              id="pref-group"
              checked={messages.groupConsecutive}
              onCheckedChange={(checked) => setMessagePreference("groupConsecutive", checked)}
            />
          }
        />
        <SettingRow
          label="Show typing indicators"
          description="Also lets teammates see when you're typing."
          htmlFor="pref-typing"
          control={
            <Switch
              id="pref-typing"
              checked={messages.showTypingIndicators}
              onCheckedChange={(checked) => setMessagePreference("showTypingIndicators", checked)}
            />
          }
        />
        <SettingRow
          label="Show link previews"
          description="Expand a summary card under links shared in messages."
          htmlFor="pref-links"
          control={
            <Switch
              id="pref-links"
              checked={messages.showLinkPreviews}
              onCheckedChange={(checked) => setMessagePreference("showLinkPreviews", checked)}
            />
          }
        />
      </SettingSection>

      <SettingSection
        title="Keyboard"
        description="Every shortcut also has a visible control."
        action={
          <Button variant="secondary" size="sm" onClick={() => setShortcutsOpen(true)}>
            View all
          </Button>
        }
      >
        {SHORTCUTS.slice(0, 5).map((shortcut) => (
          <SettingRow
            key={shortcut.id}
            label={shortcut.label}
            control={
              <span className="flex items-center gap-1">
                {shortcut.keys.map((key) => (
                  <Kbd key={key}>{displayKey(key, false)}</Kbd>
                ))}
              </span>
            }
          />
        ))}
      </SettingSection>

      <SettingSection title="Reset" description="Return every preference to its default.">
        <SettingRow
          label="Reset preferences"
          description="Theme, density, language, message and notification settings."
          control={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                useSettingsStore.getState().reset();
                toast.success("Preferences reset", { description: "Defaults restored." });
              }}
            >
              <RotateCcw />
              Reset to defaults
            </Button>
          }
        />
      </SettingSection>
    </>
  );
}
