"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Hash, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/settings";
import { usePermission, useTeams } from "@/hooks";
import { channelService } from "@/services";
import { isApiError } from "@/services/http";
import { useWorkspaceStore } from "@/store";

/** Mirrors the server's channel-name grammar so the error appears before submit. */
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export function CreateChannelDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const setActiveConversation = useWorkspaceStore((state) => state.setActiveConversation);

  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [kind, setKind] = useState<"public" | "private">("public");
  const [teamId, setTeamId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Putting a channel in a team is a team decision, so only people who manage
  // teams are offered it — and only once there is a team to choose.
  const canManageTeams = usePermission("p_team_manage");
  const { data: teams } = useTeams();
  const showTeams = canManageTeams && (teams?.length ?? 0) > 0;

  const trimmed = name.trim().toLowerCase();
  const nameError = trimmed.length > 0 && !NAME_PATTERN.test(trimmed)
    ? "Use lowercase letters, numbers, hyphens and underscores."
    : null;
  const canSubmit = trimmed.length > 0 && !nameError && !isSaving;

  const reset = () => {
    setName("");
    setPurpose("");
    setKind("public");
    setTeamId("");
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    setError(null);
    try {
      const channel = await channelService.create({ name: trimmed, purpose, kind, teamId: teamId || undefined });
      await queryClient.invalidateQueries({ queryKey: ["channels"] });
      if (teamId) await queryClient.invalidateQueries({ queryKey: ["teams"] });
      if (channel) setActiveConversation(channel.id);
      toast.success("Channel created", { description: `#${trimmed}` });
      onOpenChange(false);
      reset();
    } catch (caught) {
      // The server owns uniqueness and permission; say what it said.
      setError(isApiError(caught) ? caught.message : `Could not create #${trimmed}. Try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create a channel</DialogTitle>
          <DialogDescription>
            Channels organise conversation around a topic.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="channel-name">Name</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle">
                  {kind === "private" ? <Lock className="size-3.5" /> : <Hash className="size-3.5" />}
                </span>
                <Input
                  id="channel-name"
                  autoFocus
                  value={name}
                  maxLength={80}
                  placeholder="platform-oncall"
                  aria-invalid={Boolean(nameError)}
                  onChange={(event) => setName(event.target.value)}
                  className="pl-8"
                />
              </div>
              {nameError && <p className="text-2xs text-danger">{nameError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="channel-purpose">Purpose</Label>
              <Input
                id="channel-purpose"
                value={purpose}
                maxLength={250}
                placeholder="What is this channel for?"
                onChange={(event) => setPurpose(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <SegmentedControl<"public" | "private">
                ariaLabel="Channel visibility"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "public", label: "Public", icon: <Hash className="size-3.5" /> },
                  { value: "private", label: "Private", icon: <Lock className="size-3.5" /> },
                ]}
              />
              <p className="text-2xs text-fg-subtle">
                {kind === "public"
                  ? "Anyone in the workspace can find and join this channel."
                  : "Only people who are invited can see this channel."}
              </p>
            </div>

            {showTeams && (
              <div className="space-y-1.5">
                <Label htmlFor="channel-team">Team (optional)</Label>
                <select
                  id="channel-team"
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-surface px-2 text-sm text-fg shadow-xs hover:border-border-strong focus-visible:border-accent"
                >
                  <option value="">No team</option>
                  {teams?.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <p className="text-2xs text-fg-subtle">
                  {teamId
                    ? "Everyone in the team is added to this channel, and new people who join the team are added too."
                    : "Choose a team to add all of its people at once."}
                </p>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
              {isSaving && <Loader2 className="animate-spin" />}
              Create channel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
