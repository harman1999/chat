"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, PlugZap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SettingRow, SettingSection } from "@/components/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { adminService } from "@/services";
import type { SsoSettings as Saved } from "@/services/adminService";
import { isApiError } from "@/services/http";

/** "a.com, b.org" -> ["a.com", "b.org"]; the server checks each one again. */
const parseDomains = (text: string) =>
  [...new Set(text.split(/[\s,;]+/).map((part) => part.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];

function SsoForm({ saved }: { saved: Saved }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(saved.enabled);
  const [label, setLabel] = useState(saved.label);
  const [issuer, setIssuer] = useState(saved.issuer);
  const [clientId, setClientId] = useState(saved.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [domainsText, setDomainsText] = useState(saved.allowedDomains.join(", "));
  const [autoCreate, setAutoCreate] = useState(saved.autoCreate);
  const [enforced, setEnforced] = useState(saved.enforced);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const domains = parseDomains(domainsText);
  const needsDomain = autoCreate && domains.length === 0;
  const canSave = !isSaving && label.trim() && issuer.trim() && clientId.trim() && !needsDomain;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(saved.redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy", { description: "Select the address and copy it by hand." });
    }
  };

  const runTest = async () => {
    setIsTesting(true);
    setTest(null);
    try {
      await adminService.testSso(issuer.trim());
      setTest({ ok: true, message: "Reached the provider and its settings look right." });
    } catch (error) {
      setTest({ ok: false, message: isApiError(error) ? error.message : "Could not check the provider." });
    } finally {
      setIsTesting(false);
    }
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await adminService.saveSso({
        enabled,
        label: label.trim(),
        issuer: issuer.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
        allowedDomains: domains,
        autoCreate,
        enforced,
      });
      setClientSecret("");
      await queryClient.invalidateQueries({ queryKey: ["admin-sso"] });
      toast.success("Single sign-on saved");
    } catch (error) {
      toast.error("Could not save", { description: isApiError(error) ? error.message : undefined });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingSection
      title="Single sign-on"
      description="Let people sign in with your company's identity provider (OpenID Connect — Google, Microsoft Entra, Okta, Auth0 and others)."
    >
      <SettingRow
        label="Turn on single sign-on"
        description="Adds a button to the sign-in page. Passwords keep working unless you require single sign-on below."
        htmlFor="sso-enabled"
        control={<Switch id="sso-enabled" checked={enabled} onCheckedChange={setEnabled} />}
      />

      <SettingRow label="Redirect address" description="Add this to your provider as an allowed redirect (callback) URL.">
        <div className="mt-2 flex gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-raised px-2.5 py-1.5 font-mono text-xs text-fg">
            {saved.redirectUri}
          </code>
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </SettingRow>

      <SettingRow label="Button text" description="Shown as “Sign in with …”." htmlFor="sso-label">
        <Input id="sso-label" value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className="mt-2 max-w-xs" />
      </SettingRow>

      <SettingRow
        label="Issuer address"
        description="Your provider's address, e.g. https://accounts.google.com or https://your-company.okta.com."
        htmlFor="sso-issuer"
      >
        <div className="mt-2 flex gap-1.5">
          <Input
            id="sso-issuer"
            value={issuer}
            placeholder="https://"
            onChange={(e) => {
              setIssuer(e.target.value);
              setTest(null);
            }}
          />
          <Button variant="secondary" size="sm" disabled={!issuer.trim() || isTesting} onClick={() => void runTest()}>
            {isTesting ? <Loader2 className="animate-spin" /> : <PlugZap />}
            Test
          </Button>
        </div>
        {test && (
          <p role="status" className={test.ok ? "mt-1.5 text-2xs text-fg-muted" : "mt-1.5 text-2xs text-danger"}>
            {test.message}
          </p>
        )}
      </SettingRow>

      <SettingRow label="Client ID" htmlFor="sso-client-id">
        <Input id="sso-client-id" value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-2 max-w-md" autoComplete="off" />
      </SettingRow>

      <SettingRow
        label="Client secret"
        description={saved.hasSecret ? "A secret is saved. Leave this empty to keep it, or type a new one to replace it." : "From your provider. Stored encrypted and never shown again."}
        htmlFor="sso-secret"
      >
        <Input
          id="sso-secret"
          type="password"
          value={clientSecret}
          placeholder={saved.hasSecret ? "Saved" : ""}
          autoComplete="new-password"
          onChange={(e) => setClientSecret(e.target.value)}
          className="mt-2 max-w-md"
        />
      </SettingRow>

      <SettingRow
        label="Allowed email domains"
        description="Only people whose email ends in one of these can sign in this way for the first time. Leave empty to allow any."
        htmlFor="sso-domains"
      >
        <Input
          id="sso-domains"
          value={domainsText}
          placeholder="company.com, subsidiary.com"
          onChange={(e) => setDomainsText(e.target.value)}
          className="mt-2 max-w-md"
        />
      </SettingRow>

      <SettingRow
        label="Create accounts for new people"
        description="Someone with an allowed email who has no account yet gets one, as a Member. Needs at least one domain above."
        htmlFor="sso-auto"
        control={<Switch id="sso-auto" checked={autoCreate} onCheckedChange={setAutoCreate} />}
      >
        {needsDomain && <p className="mt-1 text-2xs text-danger">Add an allowed domain first.</p>}
      </SettingRow>

      <SettingRow
        label="Require single sign-on"
        description="Passwords stop working for everyone except the owner, who can always use one. Sign in once with single sign-on yourself first, so you know it works."
        htmlFor="sso-enforced"
        control={<Switch id="sso-enforced" checked={enforced} disabled={!enabled} onCheckedChange={setEnforced} />}
      />

      <div className="flex justify-end p-3.5 sm:px-4">
        <Button variant="primary" size="sm" disabled={!canSave} onClick={() => void save()}>
          {isSaving && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </SettingSection>
  );
}

export function SsoSettings() {
  const { data, isPending } = useQuery({ queryKey: ["admin-sso"], queryFn: () => adminService.sso() });
  if (isPending || !data) return <Skeleton className="h-64 w-full rounded-lg" />;
  // Remounted when what was saved changes, so the form shows exactly that.
  return <SsoForm key={JSON.stringify(data)} saved={data} />;
}
