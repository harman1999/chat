"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SegmentedControl, SettingRow, SettingSection, SettingSelect } from "@/components/settings";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { NotificationLevel } from "@/types";
import { AdminPage } from "./admin-page";

const LEVELS: { value: NotificationLevel; label: string }[] = [
  { value: "all", label: "All messages" },
  { value: "mentions", label: "Mentions" },
  { value: "none", label: "Nothing" },
];

/**
 * Workspace-wide notification defaults. These seed each person's own settings;
 * individuals can still override them unless the default is enforced.
 */
export function NotificationsAdmin() {
  const [channelDefault, setChannelDefault] = useState<NotificationLevel>("mentions");
  const [dmDefault, setDmDefault] = useState<NotificationLevel>("all");
  const [enforce, setEnforce] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [digest, setDigest] = useState("daily");
  const [senderName, setSenderName] = useState("Northwind on Helix");
  const [quietHours, setQuietHours] = useState(true);

  return (
    <AdminPage
      title="Notifications"
      description="Defaults applied to new accounts, and the channels the workspace may notify through."
    >
      <div className="space-y-8">
        <SettingSection title="Defaults for new accounts" description="People can change these unless you enforce them.">
          <SettingRow
            label="Channel messages"
            control={
              <SegmentedControl<NotificationLevel>
                ariaLabel="Default channel notification level"
                value={channelDefault}
                onChange={setChannelDefault}
                options={LEVELS}
              />
            }
          />
          <SettingRow
            label="Direct messages"
            control={
              <SegmentedControl<NotificationLevel>
                ariaLabel="Default direct message notification level"
                value={dmDefault}
                onChange={setDmDefault}
                options={LEVELS}
              />
            }
          />
          <SettingRow
            label="Enforce these defaults"
            description="Prevents people from changing their notification levels."
            htmlFor="notif-enforce"
            control={
              <Switch
                id="notif-enforce"
                checked={enforce}
                onCheckedChange={(checked) => {
                  setEnforce(checked);
                  toast.success(checked ? "Defaults are now enforced" : "People can set their own levels");
                }}
              />
            }
          />
          <SettingRow
            label="Organisation quiet hours"
            description="Suppress notifications outside working hours in each person's time zone."
            htmlFor="notif-quiet"
            control={
              <Switch id="notif-quiet" checked={quietHours} onCheckedChange={setQuietHours} />
            }
          />
        </SettingSection>

        <SettingSection title="Email" description="How the workspace sends mail.">
          <SettingRow
            label="Send email notifications"
            htmlFor="notif-email"
            control={<Switch id="notif-email" checked={emailEnabled} onCheckedChange={setEmailEnabled} />}
          />
          <SettingRow
            label="Sender name"
            htmlFor="notif-sender"
            control={
              <Input
                id="notif-sender"
                value={senderName}
                disabled={!emailEnabled}
                onChange={(event) => setSenderName(event.target.value)}
                className="max-w-64"
              />
            }
          />
          <SettingRow
            label="Activity digest"
            description="Summary sent to people who have been away."
            htmlFor="notif-digest-admin"
            control={
              <SettingSelect
                id="notif-digest-admin"
                value={digest}
                disabled={!emailEnabled}
                onChange={(event) => setDigest(event.target.value)}
              >
                <option value="never">Never</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </SettingSelect>
            }
          />
        </SettingSection>
      </div>
    </AdminPage>
  );
}
