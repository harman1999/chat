"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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

export function IncomingWebhooksPanel({ onReveal }: { onReveal: (secret: RevealedSecret) => void }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["integration-incoming"],
    queryFn: () => adminService.integrations.listIncoming(),
  });
  const { data: bots } = useQuery({
    queryKey: ["integration-bots"],
    queryFn: () => adminService.integrations.listBots(),
  });
  const { data: channels } = useQuery({
    queryKey: ["admin-channels"],
    queryFn: () => adminService.listChannels(),
  });

  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [botUserId, setBotUserId] = useState("");

  const create = useMutation({
    mutationFn: () =>
      adminService.integrations.createIncoming({ name: name.trim(), channelId, botUserId }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["integration-incoming"] });
      setName("");
      onReveal({
        title: "Webhook URL created",
        description:
          "POST {\"text\": \"...\"} to this URL. The URL is the credential — anyone who has it can post to the channel.",
        values: [{ label: "Webhook URL", value: result.url, isSecret: true }],
      });
    },
    onError: (error) =>
      toast.error("Could not create the webhook", {
        description: isApiError(error) ? error.message : undefined,
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminService.integrations.deleteIncoming(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["integration-incoming"] });
      toast.success("Webhook deleted");
    },
    onError: () => toast.error("Could not delete the webhook"),
  });

  const selectClass =
    "h-8 w-full appearance-none rounded-md border border-border bg-surface px-2.5 text-sm text-fg shadow-xs";
  const postable = (channels ?? []).filter((channel) => channel.kind === "public" || channel.kind === "private");

  return (
    <IntegrationPanel
      title="Incoming webhooks"
      description="Gives an external system a URL it can POST to. Messages arrive in one channel, attributed to a bot you choose."
      isPending={isPending}
      isEmpty={(data ?? []).length === 0}
      emptyText="No incoming webhooks yet."
      form={
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field
            id="hook-name"
            label="Name"
            placeholder="Monitoring alerts"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="space-y-1.5">
            <label htmlFor="hook-channel" className="text-xs font-medium text-fg">Channel</label>
            <select id="hook-channel" className={selectClass} value={channelId}
              onChange={(event) => setChannelId(event.target.value)}>
              <option value="">Choose a channel</option>
              {postable.map((channel) => (
                <option key={channel.id} value={channel.id}>#{channel.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="hook-bot" className="text-xs font-medium text-fg">Post as</label>
            <select id="hook-bot" className={selectClass} value={botUserId}
              onChange={(event) => setBotUserId(event.target.value)}>
              <option value="">Choose a bot</option>
              {(bots ?? []).filter((bot) => bot.isActive).map((bot) => (
                <option key={bot.id} value={bot.id}>{bot.displayName}</option>
              ))}
            </select>
            <p className="text-2xs text-fg-subtle">
              The bot is added to the channel, because posting uses the same membership rules as
              anyone else.
            </p>
          </div>
          <Button type="submit" variant="primary" size="sm" className="w-full"
            disabled={!name.trim() || !channelId || !botUserId || create.isPending}>
            Create webhook
          </Button>
        </form>
      }
    >
      {(data ?? []).map((hook) => (
        <Row
          key={hook.id}
          title={
            <span className="flex items-center gap-1.5">
              {hook.name}
              {!hook.isEnabled && <Badge variant="neutral" size="sm">Disabled</Badge>}
            </span>
          }
          subtitle={`#${hook.channelName} · as ${hook.botName} · ${hook.postCount} posted`}
          meta={
            <span className="shrink-0 text-2xs text-fg-subtle">
              {hook.lastUsedAt ? formatRelative(hook.lastUsedAt) : "unused"}
            </span>
          }
          actions={
            <div className="flex shrink-0 gap-1">
              <EnableToggle kind="incoming-webhooks" id={hook.id} label={hook.name}
                isEnabled={hook.isEnabled} queryKey="integration-incoming" />
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${hook.name}`}
                onClick={() => remove.mutate(hook.id)}>
                <Trash2 />
              </Button>
            </div>
          }
        />
      ))}
    </IntegrationPanel>
  );
}

export function OutgoingWebhooksPanel({ onReveal }: { onReveal: (secret: RevealedSecret) => void }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["integration-outgoing"],
    queryFn: () => adminService.integrations.listOutgoing(),
  });
  const { data: channels } = useQuery({
    queryKey: ["admin-channels"],
    queryFn: () => adminService.listChannels(),
  });
  const { data: connections } = useQuery({
    queryKey: ["integration-oauth-connections"],
    queryFn: () => adminService.integrations.listConnections(),
  });

  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [triggers, setTriggers] = useState("");
  const [channelId, setChannelId] = useState("");
  const [connectionId, setConnectionId] = useState("");

  const create = useMutation({
    mutationFn: () =>
      adminService.integrations.createOutgoing({
        name: name.trim(),
        channelId: channelId || null,
        targetUrl: targetUrl.trim(),
        triggerWords: triggers.split(",").map((word) => word.trim()).filter(Boolean),
        connectionId: connectionId || null,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["integration-outgoing"] });
      setName("");
      setTargetUrl("");
      setTriggers("");
      onReveal({
        title: "Outgoing webhook created",
        description:
          "Each delivery carries X-Helix-Signature, an HMAC of the timestamp and body. Verify it with this secret so you can tell a real delivery from a forged one.",
        values: [{ label: "Signing secret", value: result.signingSecret, isSecret: true }],
      });
    },
    onError: (error) =>
      toast.error("Could not create the webhook", {
        description: isApiError(error) ? error.message : undefined,
      }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminService.integrations.deleteOutgoing(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["integration-outgoing"] });
      toast.success("Webhook deleted");
    },
    onError: () => toast.error("Could not delete the webhook"),
  });

  const selectClass =
    "h-8 w-full appearance-none rounded-md border border-border bg-surface px-2.5 text-sm text-fg shadow-xs";

  return (
    <IntegrationPanel
      title="Outgoing webhooks"
      description="Posts matching messages to a URL you control. This server makes the request, so only public addresses are allowed."
      isPending={isPending}
      isEmpty={(data ?? []).length === 0}
      emptyText="No outgoing webhooks yet."
      form={
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <Field id="out-name" label="Name" placeholder="Deploy listener" maxLength={80}
            value={name} onChange={(event) => setName(event.target.value)} />
          <Field id="out-url" label="Target URL" placeholder="https://example.com/hooks/helix"
            value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} />
          <div className="space-y-1.5">
            <label htmlFor="out-channel" className="text-xs font-medium text-fg">Channel</label>
            <select id="out-channel" className={selectClass} value={channelId}
              onChange={(event) => setChannelId(event.target.value)}>
              <option value="">Every channel</option>
              {(channels ?? []).filter((c) => c.kind === "public" || c.kind === "private").map((channel) => (
                <option key={channel.id} value={channel.id}>#{channel.name}</option>
              ))}
            </select>
          </div>
          <Field id="out-triggers" label="Trigger words" placeholder="deploy, release"
            hint="Comma separated. Leave blank to send every message."
            value={triggers} onChange={(event) => setTriggers(event.target.value)} />
          <div className="space-y-1.5">
            <label htmlFor="out-connection" className="text-xs font-medium text-fg">Authenticate as</label>
            <select id="out-connection" className={selectClass} value={connectionId}
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
            disabled={!name.trim() || !targetUrl.trim() || create.isPending}>
            Create webhook
          </Button>
        </form>
      }
    >
      {(data ?? []).map((hook) => (
        <Row
          key={hook.id}
          title={
            <span className="flex items-center gap-1.5">
              {hook.name}
              {!hook.isEnabled && <Badge variant="neutral" size="sm">Disabled</Badge>}
              {hook.connectionName && (
                <Badge variant="accent-subtle" size="sm">as {hook.connectionName}</Badge>
              )}
            </span>
          }
          subtitle={
            <>
              {hook.channelName ? `#${hook.channelName}` : "every channel"}
              {hook.triggerWords.length ? ` · ${hook.triggerWords.join(", ")}` : " · all messages"}
              {" · "}
              {hook.targetUrl}
            </>
          }
          meta={
            /* Delivery health, so a broken endpoint is visible rather than silent. */
            hook.lastAttemptAt ? (
              <Badge variant={hook.failureCount > 0 ? "warning" : "success"} size="sm">
                {hook.failureCount > 0 ? `${hook.failureCount} failing` : `HTTP ${hook.lastStatus}`}
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">Untried</Badge>
            )
          }
          actions={
            <div className="flex shrink-0 gap-1">
              <EnableToggle kind="outgoing-webhooks" id={hook.id} label={hook.name}
                isEnabled={hook.isEnabled} queryKey="integration-outgoing" />
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${hook.name}`}
                onClick={() => remove.mutate(hook.id)}>
                <Trash2 />
              </Button>
            </div>
          }
        />
      ))}
    </IntegrationPanel>
  );
}
