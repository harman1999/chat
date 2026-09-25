"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Power } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminService } from "@/services";
import { isApiError } from "@/services/http";
import { formatRelative } from "@/lib/format";
import { Field, IntegrationPanel, Row } from "./panel";
import type { RevealedSecret } from "./secret-reveal";

/** "Deploy Bot" -> "deploy.bot", the same derivation the server uses. */
function handleFrom(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
}

export function BotsPanel({ onReveal }: { onReveal: (secret: RevealedSecret) => void }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["integration-bots"],
    queryFn: () => adminService.integrations.listBots(),
  });

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");

  const effectiveHandle = username.trim() || handleFrom(displayName);

  const create = useMutation({
    mutationFn: () =>
      adminService.integrations.createBot({
        displayName: displayName.trim(),
        username: effectiveHandle,
        description: description.trim(),
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["integration-bots"] });
      setDisplayName("");
      setUsername("");
      setDescription("");
      onReveal({
        title: `${result.bot.displayName} is ready`,
        description:
          "Send this as an Authorization: Bearer header. It acts as the bot, so it can only reach channels the bot is a member of.",
        values: [{ label: "API token", value: result.token, isSecret: true }],
      });
    },
    onError: (error) =>
      toast.error("Could not create the bot", {
        description: isApiError(error) ? error.message : undefined,
      }),
  });

  const issue = useMutation({
    mutationFn: (botId: string) => adminService.integrations.issueToken(botId, "Additional token"),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["integration-bots"] });
      onReveal({
        title: "New token issued",
        description: "The previous tokens still work until you revoke them.",
        values: [{ label: "API token", value: result.token, isSecret: true }],
      });
    },
    onError: () => toast.error("Could not issue a token"),
  });

  const setActive = useMutation({
    mutationFn: ({ botId, isActive }: { botId: string; isActive: boolean }) =>
      adminService.integrations.setBotActive(botId, isActive),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["integration-bots"] });
      toast.success(variables.isActive ? "Bot enabled" : "Bot disabled");
    },
    onError: () => toast.error("Could not change the bot"),
  });

  return (
    <IntegrationPanel
      title="Bot accounts"
      description="A bot is a workspace member with an API token instead of a password. It posts under its own name and can only reach channels it has been added to."
      isPending={isPending}
      isEmpty={(data ?? []).length === 0}
      emptyText="No bots yet."
      form={
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field
            id="bot-name"
            label="Display name"
            placeholder="Deploy Bot"
            maxLength={80}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <Field
            id="bot-username"
            label="Username"
            placeholder={handleFrom(displayName) || "deploy.bot"}
            hint="Derived from the name when left blank."
            maxLength={40}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <Field
            id="bot-description"
            label="What it does"
            placeholder="Announces deployments"
            maxLength={200}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="w-full"
            disabled={!displayName.trim() || !effectiveHandle || create.isPending}
          >
            Create bot
          </Button>
        </form>
      }
    >
      {(data ?? []).map((bot) => (
        <Row
          key={bot.id}
          title={
            <span className="flex items-center gap-1.5">
              {bot.displayName}
              <Badge variant="neutral" size="sm">
                @{bot.username}
              </Badge>
              {!bot.isActive && (
                <Badge variant="warning" size="sm">
                  Disabled
                </Badge>
              )}
            </span>
          }
          subtitle={
            <>
              {bot.tokenCount} active {bot.tokenCount === 1 ? "token" : "tokens"}
              {bot.lastUsedAt ? ` · last used ${formatRelative(bot.lastUsedAt)}` : " · never used"}
            </>
          }
          actions={
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Issue a token for ${bot.displayName}`}
                title="Issue another token"
                onClick={() => issue.mutate(bot.id)}
              >
                <KeyRound />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${bot.isActive ? "Disable" : "Enable"} ${bot.displayName}`}
                title={bot.isActive ? "Disable" : "Enable"}
                onClick={() => setActive.mutate({ botId: bot.id, isActive: !bot.isActive })}
              >
                <Power />
              </Button>
            </div>
          }
        />
      ))}
    </IntegrationPanel>
  );
}
