"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminService } from "@/services";
import { isApiError } from "@/services/http";
import { formatRelative } from "@/lib/format";
import { EnableToggle } from "./enable-toggle";
import { Field, IntegrationPanel, Row } from "./panel";
import type { RevealedSecret } from "./secret-reveal";

export function CommandsPanel({ onReveal }: { onReveal: (secret: RevealedSecret) => void }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["integration-commands"],
    queryFn: () => adminService.integrations.listCommands(),
  });

  const [command, setCommand] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [usageHint, setUsageHint] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [connectionId, setConnectionId] = useState("");

  const { data: connections } = useQuery({
    queryKey: ["integration-oauth-connections"],
    queryFn: () => adminService.integrations.listConnections(),
  });

  const selectClass =
    "h-8 w-full appearance-none rounded-md border border-border bg-surface px-2.5 text-sm text-fg shadow-xs";

  const create = useMutation({
    mutationFn: () =>
      adminService.integrations.createCommand({
        command: command.trim().replace(/^\//, ""),
        name: name.trim(),
        description: description.trim(),
        usageHint: usageHint.trim(),
        targetUrl: targetUrl.trim(),
        connectionId: connectionId || null,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["integration-commands"] });
      setCommand("");
      setName("");
      setDescription("");
      setUsageHint("");
      setTargetUrl("");
      onReveal({
        title: "Command registered",
        description:
          "Requests carry X-Helix-Signature. Verify it with this secret, then reply with {\"responseType\": \"ephemeral\" | \"in_channel\", \"text\": \"...\"}.",
        values: [{ label: "Signing secret", value: result.signingSecret, isSecret: true }],
      });
    },
    onError: (error) =>
      toast.error("Could not register the command", {
        description: isApiError(error) ? error.message : undefined,
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminService.integrations.deleteCommand(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["integration-commands"] });
      toast.success("Command removed");
    },
    onError: () => toast.error("Could not remove the command"),
  });

  return (
    <IntegrationPanel
      title="Slash commands"
      description="Typing the command in a channel calls your endpoint and shows its reply. An ephemeral reply is seen only by the person who ran it."
      isPending={isPending}
      isEmpty={(data ?? []).length === 0}
      emptyText="No commands registered yet."
      form={
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <Field id="cmd-command" label="Command" placeholder="weather" maxLength={40}
            hint="Typed as /weather. Lowercase letters, numbers and hyphens."
            value={command} onChange={(event) => setCommand(event.target.value)} />
          <Field id="cmd-name" label="Name" placeholder="Weather lookup" maxLength={80}
            value={name} onChange={(event) => setName(event.target.value)} />
          <Field id="cmd-description" label="Description" placeholder="Shows the forecast" maxLength={200}
            value={description} onChange={(event) => setDescription(event.target.value)} />
          <Field id="cmd-hint" label="Usage hint" placeholder="[city]" maxLength={80}
            hint="Shown beside the command in the composer."
            value={usageHint} onChange={(event) => setUsageHint(event.target.value)} />
          <Field id="cmd-url" label="Request URL" placeholder="https://example.com/commands/weather"
            value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} />
          <div className="space-y-1.5">
            <label htmlFor="cmd-connection" className="text-xs font-medium text-fg">Authenticate as</label>
            <select id="cmd-connection" className={selectClass} value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}>
              <option value="">Nobody — send unauthenticated</option>
              {(connections ?? []).filter((c) => c.status === "connected").map((connection) => (
                <option key={connection.id} value={connection.id}>{connection.name}</option>
              ))}
            </select>
            <p className="text-2xs text-fg-subtle">
              Adds this connection&apos;s access token as a bearer header, refreshing it when it
              expires. Only connected ones can be chosen.
            </p>
          </div>

          <Button type="submit" variant="primary" size="sm" className="w-full"
            disabled={!command.trim() || !name.trim() || !targetUrl.trim() || create.isPending}>
            Register command
          </Button>
        </form>
      }
    >
      {(data ?? []).map((entry) => (
        <Row
          key={entry.id}
          title={
            <span className="flex items-center gap-1.5">
              <code className="font-mono">/{entry.command}</code>
              {entry.usageHint && <span className="text-2xs text-fg-subtle">{entry.usageHint}</span>}
              {!entry.isEnabled && <Badge variant="neutral" size="sm">Disabled</Badge>}
              {entry.connectionName && (
                <Badge variant="accent-subtle" size="sm">as {entry.connectionName}</Badge>
              )}
            </span>
          }
          subtitle={`${entry.description || entry.name} · ${entry.targetUrl}`}
          meta={
            <span className="shrink-0 text-2xs text-fg-subtle">
              {entry.lastUsedAt ? formatRelative(entry.lastUsedAt) : "unused"}
            </span>
          }
          actions={
            <div className="flex shrink-0 gap-1">
              <EnableToggle kind="slash-commands" id={entry.id} label={`/${entry.command}`}
                isEnabled={entry.isEnabled} queryKey="integration-commands" />
              <Button variant="ghost" size="icon-sm" aria-label={`Remove /${entry.command}`}
                onClick={() => remove.mutate(entry.id)}>
                <Trash2 />
              </Button>
            </div>
          }
        />
      ))}
    </IntegrationPanel>
  );
}

export function OAuthAppsPanel({ onReveal }: { onReveal: (secret: RevealedSecret) => void }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["integration-oauth-apps"],
    queryFn: () => adminService.integrations.listApps(),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [redirectUris, setRedirectUris] = useState("");
  const [scopes, setScopes] = useState("messages:read");

  const create = useMutation({
    mutationFn: () =>
      adminService.integrations.createApp({
        name: name.trim(),
        description: description.trim(),
        redirectUris: redirectUris.split(/[\n,]/).map((uri) => uri.trim()).filter(Boolean),
        scopes: scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean),
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["integration-oauth-apps"] });
      setName("");
      setDescription("");
      setRedirectUris("");
      onReveal({
        title: "Application registered",
        description:
          "Use the authorization code flow with PKCE (S256) — it is required, not optional. The secret is shown only now.",
        values: [
          { label: "Client ID", value: result.clientId, isSecret: false },
          { label: "Client secret", value: result.clientSecret, isSecret: true },
        ],
      });
    },
    onError: (error) =>
      toast.error("Could not register the application", {
        description: isApiError(error) ? error.message : undefined,
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminService.integrations.deleteApp(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["integration-oauth-apps"] });
      toast.success("Application deleted", { description: "Its tokens were revoked." });
    },
    onError: () => toast.error("Could not delete the application"),
  });

  return (
    <IntegrationPanel
      title="OAuth 2.0 applications"
      description="Lets a third-party app act on a person's behalf, with their consent. Redirect URIs are matched exactly, and PKCE is required."
      isPending={isPending}
      isEmpty={(data ?? []).length === 0}
      emptyText="No applications registered yet."
      form={
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <Field id="app-name" label="Name" placeholder="Status Sync" maxLength={80}
            value={name} onChange={(event) => setName(event.target.value)} />
          <Field id="app-description" label="Description" placeholder="Mirrors status to calendar" maxLength={200}
            value={description} onChange={(event) => setDescription(event.target.value)} />
          <Field id="app-redirects" label="Redirect URIs" placeholder="https://app.example.com/callback"
            hint="One per line. Matched exactly — https, except on localhost."
            value={redirectUris} onChange={(event) => setRedirectUris(event.target.value)} />
          <Field id="app-scopes" label="Scopes" placeholder="messages:read messages:write"
            value={scopes} onChange={(event) => setScopes(event.target.value)} />
          <Button type="submit" variant="primary" size="sm" className="w-full"
            disabled={!name.trim() || !redirectUris.trim() || create.isPending}>
            Register application
          </Button>
        </form>
      }
    >
      {(data ?? []).map((app) => (
        <Row
          key={app.id}
          title={
            <span className="flex items-center gap-1.5">
              {app.name}
              {!app.isEnabled && <Badge variant="neutral" size="sm">Disabled</Badge>}
            </span>
          }
          subtitle={
            <>
              <code className="font-mono">{app.clientId}</code>
              {app.scopes.length ? ` · ${app.scopes.join(", ")}` : ""}
            </>
          }
          meta={
            <Badge variant="neutral" size="sm">
              {app.authorisedUsers} authorised
            </Badge>
          }
          actions={
            <div className="flex shrink-0 gap-1">
              <EnableToggle kind="oauth-apps" id={app.id} label={app.name}
                isEnabled={app.isEnabled} queryKey="integration-oauth-apps" />
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${app.name}`}
                onClick={() => remove.mutate(app.id)}>
                <Trash2 />
              </Button>
            </div>
          }
        />
      ))}
    </IntegrationPanel>
  );
}

const CONNECTION_VARIANT = {
  connected: "success",
  disconnected: "neutral",
  error: "warning",
} as const;

export function OAuthConnectionsPanel() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["integration-oauth-connections"],
    queryFn: () => adminService.integrations.listConnections(),
  });

  const [form, setForm] = useState({
    name: "", provider: "", clientId: "", clientSecret: "",
    authorizeUrl: "", tokenUrl: "", scopes: "",
  });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const create = useMutation({
    mutationFn: () =>
      adminService.integrations.createConnection({
        name: form.name.trim(),
        provider: form.provider.trim(),
        clientId: form.clientId.trim(),
        clientSecret: form.clientSecret,
        authorizeUrl: form.authorizeUrl.trim(),
        tokenUrl: form.tokenUrl.trim(),
        scopes: form.scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["integration-oauth-connections"] });
      setForm({ name: "", provider: "", clientId: "", clientSecret: "", authorizeUrl: "", tokenUrl: "", scopes: "" });
      toast.success("Connection saved", { description: "Choose Connect to authorise it." });
    },
    onError: (error) =>
      toast.error("Could not save the connection", {
        description: isApiError(error) ? error.message : undefined,
      }),
  });

  const connect = useMutation({
    mutationFn: (id: string) => adminService.integrations.authorizeUrlFor(id),
    onSuccess: (result) => {
      // Opened rather than followed here: the provider needs the administrator's
      // own browser session to know who is granting access.
      window.open(result.authorizeUrl, "_blank", "noopener");
    },
    onError: () => toast.error("Could not start the authorisation"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminService.integrations.deleteConnection(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["integration-oauth-connections"] });
      toast.success("Connection deleted");
    },
    onError: () => toast.error("Could not delete the connection"),
  });

  return (
    <IntegrationPanel
      title="Outgoing OAuth connections"
      description="Authenticates this workspace to another service. The client secret and the tokens are encrypted at rest and never returned by the API."
      isPending={isPending}
      isEmpty={(data ?? []).length === 0}
      emptyText="No outgoing connections yet."
      form={
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <Field id="conn-name" label="Name" placeholder="GitHub" maxLength={80}
            value={form.name} onChange={set("name")} />
          <Field id="conn-provider" label="Provider" placeholder="github.com" maxLength={80}
            value={form.provider} onChange={set("provider")} />
          <Field id="conn-client-id" label="Client ID" value={form.clientId} onChange={set("clientId")} />
          <Field id="conn-client-secret" label="Client secret" type="password"
            hint="Encrypted before it is stored, because it must be sent to the provider."
            value={form.clientSecret} onChange={set("clientSecret")} />
          <Field id="conn-authorize" label="Authorize URL"
            placeholder="https://github.com/login/oauth/authorize"
            value={form.authorizeUrl} onChange={set("authorizeUrl")} />
          <Field id="conn-token" label="Token URL"
            placeholder="https://github.com/login/oauth/access_token"
            value={form.tokenUrl} onChange={set("tokenUrl")} />
          <Field id="conn-scopes" label="Scopes" placeholder="repo read:org"
            value={form.scopes} onChange={set("scopes")} />
          <Button type="submit" variant="primary" size="sm" className="w-full"
            disabled={!form.name.trim() || !form.clientId.trim() || !form.clientSecret ||
              !form.authorizeUrl.trim() || !form.tokenUrl.trim() || create.isPending}>
            Save connection
          </Button>
        </form>
      }
    >
      {(data ?? []).map((connection) => (
        <Row
          key={connection.id}
          title={connection.name}
          subtitle={
            connection.status === "error" && connection.lastError
              ? connection.lastError
              : `${connection.provider || "provider"}${connection.scopes.length ? ` · ${connection.scopes.join(", ")}` : ""}`
          }
          meta={
            <Badge variant={CONNECTION_VARIANT[connection.status]} size="sm" className="capitalize">
              {connection.status}
            </Badge>
          }
          actions={
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon-sm" title="Connect"
                aria-label={`Authorise ${connection.name}`}
                onClick={() => connect.mutate(connection.id)}>
                <ExternalLink />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${connection.name}`}
                onClick={() => remove.mutate(connection.id)}>
                <Trash2 />
              </Button>
            </div>
          }
        />
      ))}
    </IntegrationPanel>
  );
}
