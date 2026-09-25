"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePreferences } from "@/hooks";
import type { NotificationLevel } from "@/types";
import {
  SegmentedControl,
  SettingRow,
  SettingSection,
  SettingSelect,
} from "./setting-primitives";

const LEVELS: { value: NotificationLevel; label: string }[] = [
  { value: "all", label: "All messages" },
  { value: "mentions", label: "Mentions" },
  { value: "none", label: "Nothing" },
];

function KeywordEditor() {
  const { preferences, setNotificationPreference } = usePreferences();
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim().toLowerCase();
    if (!value || preferences.notifications.keywords.includes(value)) return;
    setNotificationPreference("keywords", [...preferences.notifications.keywords, value]);
    setDraft("");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {preferences.notifications.keywords.length === 0 && (
          <p className="text-xs text-fg-subtle">No keywords yet.</p>
        )}
        {preferences.notifications.keywords.map((keyword) => (
          <Badge key={keyword} variant="neutral" className="gap-1 pr-1">
            {keyword}
            <button
              type="button"
              aria-label={`Remove keyword ${keyword}`}
              onClick={() =>
                setNotificationPreference(
                  "keywords",
                  preferences.notifications.keywords.filter((item) => item !== keyword),
                )
              }
              className="grid size-3.5 place-items-center rounded-full transition-colors hover:bg-surface-hover"
            >
              <X className="size-2.5" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="mt-2.5 flex max-w-sm gap-2">
        <Input
          value={draft}
          placeholder="Add a keyword"
          aria-label="Add a notification keyword"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" size="sm" disabled={!draft.trim()} onClick={add}>
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
}

export function NotificationSettings() {
  const { preferences, setNotificationPreference } = usePreferences();
  const notifications = preferences.notifications;

  return (
    <>
      <SettingSection title="Desktop notifications" description="Alerts shown outside the app.">
        <SettingRow
          label="Enable desktop notifications"
          description="Requires permission from your browser."
          htmlFor="notif-desktop"
          control={
            <Switch
              id="notif-desktop"
              checked={notifications.desktopEnabled}
              onCheckedChange={(checked) => setNotificationPreference("desktopEnabled", checked)}
            />
          }
        />
        <SettingRow
          label="Play a sound"
          htmlFor="notif-sound"
          control={
            <Switch
              id="notif-sound"
              checked={notifications.playSound}
              disabled={!notifications.desktopEnabled}
              onCheckedChange={(checked) => setNotificationPreference("playSound", checked)}
            />
          }
        />
      </SettingSection>

      <SettingSection title="What to notify me about" description="Defaults for new conversations. Individual channels can override these.">
        <SettingRow
          label="Channel messages"
          description="Applies to channels without their own setting."
          control={
            <SegmentedControl<NotificationLevel>
              ariaLabel="Channel notification level"
              value={notifications.channelLevel}
              onChange={(value) => setNotificationPreference("channelLevel", value)}
              options={LEVELS}
            />
          }
        />
        <SettingRow
          label="Direct messages"
          control={
            <SegmentedControl<NotificationLevel>
              ariaLabel="Direct message notification level"
              value={notifications.directMessages}
              onChange={(value) => setNotificationPreference("directMessages", value)}
              options={LEVELS}
            />
          }
        />
        <SettingRow
          label="Thread replies"
          description="Notify me about replies in threads I follow."
          htmlFor="notif-threads"
          control={
            <Switch
              id="notif-threads"
              checked={notifications.threadReplies}
              onCheckedChange={(checked) => setNotificationPreference("threadReplies", checked)}
            />
          }
        />
        <SettingRow
          label="Keywords"
          description="Notify me when these words appear, even without an @mention."
        >
          <KeywordEditor />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Do not disturb" description="Pause notifications on a schedule.">
        <SettingRow
          label="Scheduled quiet hours"
          htmlFor="notif-dnd"
          control={
            <Switch
              id="notif-dnd"
              checked={notifications.doNotDisturb.enabled}
              onCheckedChange={(checked) =>
                setNotificationPreference("doNotDisturb", {
                  ...notifications.doNotDisturb,
                  enabled: checked,
                })
              }
            />
          }
        >
          {notifications.doNotDisturb.enabled && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
              <label htmlFor="dnd-from" className="text-xs">
                From
              </label>
              <Input
                id="dnd-from"
                type="time"
                value={notifications.doNotDisturb.from}
                onChange={(event) =>
                  setNotificationPreference("doNotDisturb", {
                    ...notifications.doNotDisturb,
                    from: event.target.value,
                  })
                }
                className="w-28"
              />
              <label htmlFor="dnd-to" className="text-xs">
                to
              </label>
              <Input
                id="dnd-to"
                type="time"
                value={notifications.doNotDisturb.to}
                onChange={(event) =>
                  setNotificationPreference("doNotDisturb", {
                    ...notifications.doNotDisturb,
                    to: event.target.value,
                  })
                }
                className="w-28"
              />
            </div>
          )}
        </SettingRow>
      </SettingSection>

      <SettingSection title="Email" description="What we send when you're away.">
        <SettingRow
          label="Activity digest"
          htmlFor="notif-digest"
          control={
            <SettingSelect
              id="notif-digest"
              value={notifications.emailDigest}
              onChange={(event) =>
                setNotificationPreference(
                  "emailDigest",
                  event.target.value as typeof notifications.emailDigest,
                )
              }
            >
              <option value="never">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </SettingSelect>
          }
        />
      </SettingSection>
    </>
  );
}
