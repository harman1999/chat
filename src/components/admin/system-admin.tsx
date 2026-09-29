"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SettingRow, SettingSection, SettingSelect } from "@/components/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AppLogoMark, WorkspaceLogo } from "@/components/common";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { useActiveWorkspace } from "@/hooks";
import { adminService } from "@/services";
import { isApiError } from "@/services/http";
import { AdminPage } from "./admin-page";

/** Mirrors the server: raster only (SVG can carry script), 1 MB. */
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_BYTES = 1024 * 1024;

/**
 * Upload or remove the workspace logo. Applies straight away rather than
 * waiting for Save changes, since a file is not something to hold as a draft.
 */
function LogoControl() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const workspace = useActiveWorkspace();

  const upload = async (file: File) => {
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error("That file can't be used", { description: "Use a PNG, JPEG or WebP image." });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("That image is too large", { description: "Logos must be 1 MB or smaller." });
      return;
    }
    setIsUploading(true);
    try {
      await adminService.uploadLogo(file);
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      // The admin header is rendered on the server.
      router.refresh();
      toast.success("Logo updated");
    } catch (error) {
      toast.error("Could not upload the logo", {
        description: isApiError(error) ? error.message : undefined,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const askToRemove = () =>
    setConfirm({
      title: "Remove the workspace logo?",
      description: "Everyone will see the default Helix mark instead.",
      destructive: true,
      confirmLabel: "Yes, remove",
      cancelLabel: "No",
      onConfirm: async () => {
        try {
          await adminService.removeLogo();
          await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
          router.refresh();
          toast.success("Logo removed");
        } catch (error) {
          toast.error("Could not remove the logo", {
            description: isApiError(error) ? error.message : undefined,
          });
          throw error;
        }
      },
    });

  return (
    <div className="flex items-center gap-3">
      <WorkspaceLogo
        logoUrl={workspace?.logoUrl ?? null}
        name={workspace?.name ?? "Workspace"}
        className="size-12 rounded-lg"
        fallback={<AppLogoMark className="size-12 rounded-lg" />}
      />
      <input
        ref={input}
        type="file"
        accept={LOGO_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      <Button variant="secondary" size="sm" disabled={isUploading} onClick={() => input.current?.click()}>
        {isUploading ? <Loader2 className="animate-spin" /> : <ImageUp />}
        {workspace?.logoUrl ? "Change logo" : "Upload logo"}
      </Button>
      {workspace?.logoUrl && (
        <Button variant="danger-ghost" size="sm" disabled={isUploading} onClick={askToRemove}>
          <Trash2 />
          Remove
        </Button>
      )}
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

export function SystemAdmin() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data, isPending } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminService.settings(),
  });

  const [form, setForm] = useState<Record<string, string | boolean | number | null>>({});
  const [domains, setDomains] = useState<string[] | null>(null);
  const [draftDomain, setDraftDomain] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

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
  const set = (key: string, next: string | boolean | number | null) => {
    setForm((current) => ({ ...current, [key]: next }));
    setIsDirty(true);
  };

  const domainList = domains ?? data.signupDomains;
  const nameIsBlank = String(value("workspaceName", data.workspaceName)).trim() === "";

  /**
   * Setting a retention deletes old messages for good, within the hour. So
   * before saving one, say how many are affected now and ask.
   */
  const reviewAndSave = async () => {
    const days = form.messageRetentionDays;
    if (typeof days !== "number" || days === 0) return save();

    setIsSaving(true);
    let count: number;
    try {
      count = (await adminService.retentionPreview(days)).messages;
    } catch (error) {
      toast.error("Could not check what would be deleted", {
        description: isApiError(error) ? error.message : undefined,
      });
      return;
    } finally {
      setIsSaving(false);
    }
    if (count === 0) return save();

    setConfirm({
      title: `Delete messages older than ${days} days?`,
      destructive: true,
      confirmLabel: "Yes, delete them",
      cancelLabel: "No",
      description: (
        <>
          <strong>{count.toLocaleString()}</strong> {count === 1 ? "message is" : "messages are"} older
          than {days} days, in channels and direct messages alike. They and their reactions and
          attachments will be <strong>permanently deleted within the hour</strong>, and from then on
          each day&apos;s oldest messages go the same way. This cannot be undone.
        </>
      ),
      onConfirm: save,
    });
  };

  const save = async () => {
    setIsSaving(true);
    try {
      // Only what was touched, so saving one field cannot overwrite another
      // administrator's change to a field this page merely displayed.
      await adminService.updateSettings({
        ...form,
        ...(domains ? { signupDomains: domains } : {}),
      } as Partial<typeof data>);
      setForm({});
      setDomains(null);
      setIsDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-settings"] }),
        // The name shows in the workspace switcher.
        queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
      ]);
      router.refresh();
      toast.success("Settings saved", { description: "Changes apply immediately." });
    } catch (error) {
      toast.error("Could not save settings", {
        description: isApiError(error) ? error.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminPage
      title="System settings"
      description="Workspace identity, membership rules and data retention."
      actions={
        <Button
          variant="primary"
          size="sm"
          disabled={!isDirty || isSaving || nameIsBlank}
          onClick={() => void reviewAndSave()}
        >
          {isSaving && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      }
    >
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
      <div className="space-y-8">
        <SettingSection title="Workspace" description="How this workspace identifies itself.">
          <SettingRow label="Name" htmlFor="sys-name">
            <Input
              id="sys-name"
              value={value("workspaceName", data.workspaceName)}
              onChange={(event) => set("workspaceName", event.target.value)}
              maxLength={120}
              aria-invalid={nameIsBlank}
              className="max-w-md"
            />
            {nameIsBlank && <p className="mt-1 text-2xs text-danger">The workspace needs a name.</p>}
          </SettingRow>
          <SettingRow
            label="Logo"
            description="PNG, JPEG or WebP, up to 1 MB. Square works best. Applies straight away."
            control={<LogoControl />}
          />
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
                value={value("messageRetentionDays", data.messageRetentionDays) ?? 0}
                // 0 is "Keep forever", which the server stores as no limit.
                onChange={(event) => set("messageRetentionDays", Number(event.target.value) || null)}
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
