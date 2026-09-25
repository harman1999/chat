"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SettingRow, SettingSection, SettingSelect } from "@/components/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { adminService } from "@/services";
import { AdminPage } from "./admin-page";

export function SystemAdmin() {
  const { data, isPending } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminService.settings(),
  });

  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [domains, setDomains] = useState<string[] | null>(null);
  const [draftDomain, setDraftDomain] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  if (isPending || !data) {
    return (
      <AdminPage title="System settings" description="Workspace-wide configuration.">
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
      </AdminPage>
    );
  }

  const value = <T,>(key: string, fallback: T): T => (form[key] as T) ?? fallback;
  const set = (key: string, next: string | boolean) => {
    setForm((current) => ({ ...current, [key]: next }));
    setIsDirty(true);
  };

  const domainList = domains ?? data.signupDomains;

  return (
    <AdminPage
      title="System settings"
      description="Workspace identity, membership rules and data retention."
      actions={
        <Button
          variant="primary"
          size="sm"
          disabled={!isDirty || isSaving}
          onClick={async () => {
            setIsSaving(true);
            try {
              await adminService.updateSettings({});
              setIsDirty(false);
              toast.success("Settings saved", { description: "Changes apply immediately." });
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {isSaving && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      }
    >
      <div className="space-y-8">
        <SettingSection title="Workspace" description="How this workspace identifies itself.">
          <SettingRow label="Name" htmlFor="sys-name">
            <Input
              id="sys-name"
              value={value("workspaceName", data.workspaceName)}
              onChange={(event) => set("workspaceName", event.target.value)}
              className="max-w-md"
            />
          </SettingRow>
          <SettingRow label="URL" description="Changing this breaks existing links." htmlFor="sys-url">
            <Input
              id="sys-url"
              value={value("workspaceUrl", data.workspaceUrl)}
              onChange={(event) => set("workspaceUrl", event.target.value)}
              className="max-w-md"
            />
          </SettingRow>
          <SettingRow
            label="Default channels"
            description="New members join these automatically."
            control={
              <div className="flex flex-wrap gap-1.5">
                {data.defaultChannelIds.map((id) => (
                  <Badge key={id} variant="neutral">
                    #{id.replace("ch_", "")}
                  </Badge>
                ))}
              </div>
            }
          />
        </SettingSection>

        <SettingSection title="Membership" description="Who may join, and how.">
          <SettingRow
            label="Allow guest accounts"
            description="Guests only see the channels they are invited to."
            htmlFor="sys-guests"
            control={
              <Switch
                id="sys-guests"
                checked={value("allowGuestAccounts", data.allowGuestAccounts)}
                onCheckedChange={(checked) => set("allowGuestAccounts", checked)}
              />
            }
          />
          <SettingRow
            label="Anyone can invite"
            description="When off, only administrators may send invitations."
            htmlFor="sys-invites"
            control={
              <Switch
                id="sys-invites"
                checked={value("allowPublicInvites", data.allowPublicInvites)}
                onCheckedChange={(checked) => set("allowPublicInvites", checked)}
              />
            }
          />
          <SettingRow
            label="Restrict sign-up to approved domains"
            htmlFor="sys-domains"
            control={
              <Switch
                id="sys-domains"
                checked={value("restrictSignupDomain", data.restrictSignupDomain)}
                onCheckedChange={(checked) => set("restrictSignupDomain", checked)}
              />
            }
          >
            {value("restrictSignupDomain", data.restrictSignupDomain) && (
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {domainList.map((domain) => (
                    <Badge key={domain} variant="neutral" className="gap-1 pr-1">
                      {domain}
                      <button
                        type="button"
                        aria-label={`Remove ${domain}`}
                        onClick={() => {
                          setDomains(domainList.filter((item) => item !== domain));
                          setIsDirty(true);
                        }}
                        className="grid size-3.5 place-items-center rounded-full transition-colors hover:bg-surface-hover"
                      >
                        <X className="size-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="mt-2.5 flex max-w-sm gap-2">
                  <Input
                    value={draftDomain}
                    placeholder="example.com"
                    aria-label="Add an approved domain"
                    onChange={(event) => setDraftDomain(event.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!draftDomain.trim()}
                    onClick={() => {
                      setDomains([...domainList, draftDomain.trim().toLowerCase()]);
                      setDraftDomain("");
                      setIsDirty(true);
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}
          </SettingRow>
        </SettingSection>

        <SettingSection title="Data retention" description="Applies to every channel and direct message.">
          <SettingRow
            label="Message retention"
            description="Messages older than this are deleted permanently."
            htmlFor="sys-msg-retention"
            control={
              <SettingSelect
                id="sys-msg-retention"
                defaultValue={data.messageRetentionDays ?? 0}
                onChange={() => setIsDirty(true)}
              >
                <option value={0}>Keep forever</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
                <option value={730}>2 years</option>
              </SettingSelect>
            }
          />

        </SettingSection>


      </div>
    </AdminPage>
  );
}
