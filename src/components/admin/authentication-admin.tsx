"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl, SettingRow, SettingSection } from "@/components/settings";
import { adminService } from "@/services";
import { formatRelative } from "@/lib/format";
import { AdminPage } from "./admin-page";

const SCIM_URL = "https://api.helix.app/scim/v2/northwind";

export function AuthenticationAdmin() {
  const { data, isPending, refetch } = useQuery({
    queryKey: ["admin-auth-providers"],
    queryFn: () => adminService.listAuthProviders(),
  });

  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [requireTwoFactor, setRequireTwoFactor] = useState(false);
  const [minLength, setMinLength] = useState("12");
  const [sessionTimeout, setSessionTimeout] = useState<"24" | "168" | "720">("720");

  return (
    <AdminPage
      title="Authentication"
      description="How people sign in to this workspace, and the policy their credentials must meet."
      actions={
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>
          <RefreshCw />
          Re-run sync
        </Button>
      }
    >
      <div className="space-y-8">
        <SettingSection title="Sign-in methods" description="At least one method must stay enabled.">
          {isPending ? (
            <div className="space-y-3 p-4" aria-hidden>
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-10 rounded-md" />
              ))}
            </div>
          ) : (
            data?.map((provider) => {
              const isOn = enabled[provider.id] ?? provider.isEnabled;
              return (
                <SettingRow
                  key={provider.id}
                  label={provider.name}
                  description={provider.description}
                  control={
                    <div className="flex items-center gap-2">

                      <Switch
                        aria-label={`Enable ${provider.name}`}
                        checked={isOn}
                        disabled={!provider.isConfigured}
                        onCheckedChange={async (checked) => {
                          setEnabled((current) => ({ ...current, [provider.id]: checked }));
                          try {
                            await adminService.setAuthProviderEnabled(provider.id, checked);
                            toast.success(checked ? "Provider enabled" : "Provider disabled", {
                              description: provider.name,
                            });
                          } catch {
                            setEnabled((current) => ({ ...current, [provider.id]: !checked }));
                            toast.error("Could not change provider", { description: provider.name });
                          }
                        }}
                      />
                    </div>
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" size="sm" className="uppercase">
                      {provider.kind}
                    </Badge>
                    {provider.isConfigured ? (
                      <span className="flex items-center gap-1 text-2xs text-success">
                        <CheckCircle2 className="size-3" aria-hidden />
                        Configured
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-2xs text-warning">
                        <ShieldAlert className="size-3" aria-hidden />
                        Not configured
                      </span>
                    )}
                    {provider.lastSyncAt && (
                      <span className="text-2xs text-fg-subtle">
                        Last sync {formatRelative(provider.lastSyncAt)}
                      </span>
                    )}
                  </div>
                </SettingRow>
              );
            })
          )}
        </SettingSection>

        <SettingSection title="Password policy" description="Applies to accounts using email and password.">
          <SettingRow
            label="Minimum length"
            htmlFor="auth-min-length"
            control={
              <Input
                id="auth-min-length"
                type="number"
                min={8}
                max={64}
                value={minLength}
                onChange={(event) => setMinLength(event.target.value)}
                className="w-24"
              />
            }
          />
          <SettingRow
            label="Require two-factor authentication"
            description="Everyone must enrol before they can post."
            htmlFor="auth-2fa"
            control={
              <Switch
                id="auth-2fa"
                checked={requireTwoFactor}
                onCheckedChange={(checked) => {
                  setRequireTwoFactor(checked);
                  toast.success(checked ? "Two-factor now required" : "Two-factor requirement removed");
                }}
              />
            }
          />
          <SettingRow
            label="Session timeout"
            description="How long a session stays valid without activity."
            control={
              <SegmentedControl
                ariaLabel="Session timeout"
                value={sessionTimeout}
                onChange={setSessionTimeout}
                options={[
                  { value: "24", label: "24 hours" },
                  { value: "168", label: "7 days" },
                  { value: "720", label: "30 days" },
                ]}
              />
            }
          />
        </SettingSection>

        <SettingSection title="Provisioning" description="Keep the directory in step with your identity provider.">
          <SettingRow
            label="SCIM endpoint"
            description="Give this URL to your identity provider."
            control={
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(SCIM_URL);
                    toast.success("SCIM URL copied");
                  } catch {
                    toast.error("Could not copy", { description: "Clipboard access was denied." });
                  }
                }}
              >
                <Copy />
                Copy URL
              </Button>
            }
          >
            <code className="block overflow-x-auto rounded-md border border-border bg-surface-subtle px-2.5 py-1.5 font-mono text-2xs text-fg-muted scrollbar-thin">
              {SCIM_URL}
            </code>
          </SettingRow>

        </SettingSection>
      </div>
    </AdminPage>
  );
}
