"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Loader2, Lock, Plus, Search, Trash2, UserMinus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUsers } from "@/hooks";
import { adminService, teamService } from "@/services";
import { isApiError } from "@/services/http";
import { cn } from "@/lib/utils";
import type { Team } from "@/types";

function errorText(error: unknown): string | undefined {
  return isApiError(error) ? error.message : undefined;
}

/**
 * One team: who is in it, which channels it has, and its name.
 *
 * Adding someone puts them in every channel the team has, and removing them
 * takes them out again — so the wording says so wherever it matters, rather than
 * leaving it to be found out.
 */
export function ManageTeamDialog({ team, onClose }: { team: Team | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const id = team?.id ?? "";

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["teams"] }),
      queryClient.invalidateQueries({ queryKey: ["team-members", id] }),
      queryClient.invalidateQueries({ queryKey: ["team-channels", id] }),
      queryClient.invalidateQueries({ queryKey: ["channels"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-channels"] }),
    ]);

  return (
    <>
      <Dialog open={team !== null} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{team?.name}</DialogTitle>
            <DialogDescription>{team?.description || "Manage who is in this team and what it has."}</DialogDescription>
          </DialogHeader>

          {team && (
            <Tabs defaultValue="people" className="px-5 pb-5 pt-2">
              <TabsList>
                <TabsTrigger value="people">People</TabsTrigger>
                <TabsTrigger value="channels">Channels</TabsTrigger>
                <TabsTrigger value="details">Details</TabsTrigger>
              </TabsList>
              <TabsContent value="people" className="pt-4">
                <PeopleTab team={team} refresh={refresh} setConfirm={setConfirm} />
              </TabsContent>
              <TabsContent value="channels" className="pt-4">
                <ChannelsTab team={team} refresh={refresh} />
              </TabsContent>
              <TabsContent value="details" className="pt-4">
                <DetailsTab team={team} refresh={refresh} setConfirm={setConfirm} onDeleted={onClose} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

type TabProps = {
  team: Team;
  refresh: () => Promise<unknown>;
  setConfirm: (options: ConfirmOptions | null) => void;
};

function PeopleTab({ team, refresh, setConfirm }: TabProps) {
  const { data: directory } = useUsers();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  const { data: members, isPending } = useQuery({
    queryKey: ["team-members", team.id],
    queryFn: () => teamService.members(team.id),
  });

  const inTeam = useMemo(() => new Set((members ?? []).map((member) => member.id)), [members]);
  const candidates = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return (directory ?? [])
      .filter((user) => !user.isBot && !inTeam.has(user.id))
      .filter((user) => !needle || user.displayName.toLowerCase().includes(needle) || user.username.includes(needle))
      .slice(0, 40);
  }, [directory, inTeam, term]);

  const add = async () => {
    setIsAdding(true);
    try {
      const { added } = await teamService.addMembers(team.id, selected);
      await refresh();
      setSelected([]);
      setTerm("");
      toast.success(added.length === 1 ? "1 person added" : `${added.length} people added`, {
        description: `They are now in ${team.name} and its channels.`,
      });
    } catch (error) {
      toast.error("Could not add people", { description: errorText(error) });
    } finally {
      setIsAdding(false);
    }
  };

  const askToRemove = (user: { id: string; displayName: string }) =>
    setConfirm({
      title: `Remove ${user.displayName} from ${team.name}?`,
      destructive: true,
      confirmLabel: "Yes, remove",
      cancelLabel: "No",
      description: (
        <>
          They leave the team and every channel it has ({team.channelCount}). Their messages stay. You
          can add them back at any time.
        </>
      ),
      onConfirm: async () => {
        try {
          await teamService.removeMember(team.id, user.id);
          await refresh();
          toast.success("Removed from the team", { description: user.displayName });
        } catch (error) {
          toast.error("Could not remove them", { description: errorText(error) });
          throw error;
        }
      },
    });

  return (
    <div className="space-y-5">
      <section aria-label="People in this team">
        <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
          In this team{members ? ` · ${members.length}` : ""}
        </h3>
        {isPending ? (
          <p className="py-3 text-xs text-fg-subtle">Loading…</p>
        ) : !members?.length ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-fg-subtle">
            Nobody yet. Add people below.
          </p>
        ) : (
          <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border scrollbar-thin">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-2.5 px-2.5 py-1.5">
                <UserAvatar user={member} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-fg">{member.displayName}</span>
                  <span className="block truncate text-2xs text-fg-subtle">{member.title || `@${member.username}`}</span>
                </span>
                <Button
                  variant="danger-ghost"
                  size="icon-sm"
                  aria-label={`Remove ${member.displayName} from ${team.name}`}
                  onClick={() => askToRemove(member)}
                >
                  <UserMinus />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Add people">
        <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">Add people</h3>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <Input
            value={term}
            placeholder="Search people"
            aria-label="Search people to add"
            onChange={(event) => setTerm(event.target.value)}
            className="pl-8"
          />
        </div>
        <ul className="mt-1.5 max-h-44 overflow-y-auto rounded-md border border-border scrollbar-thin" role="listbox" aria-multiselectable>
          {candidates.length === 0 && (
            <li className="px-2 py-4 text-center text-xs text-fg-subtle">
              {term ? `Nobody matches “${term}”.` : "Everyone is already in this team."}
            </li>
          )}
          {candidates.map((user) => {
            const isSelected = selected.includes(user.id);
            return (
              <li key={user.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setSelected((current) => (isSelected ? current.filter((x) => x !== user.id) : [...current, user.id]))}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors",
                    isSelected ? "bg-accent-subtle" : "hover:bg-surface-hover",
                  )}
                >
                  <UserAvatar user={user} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{user.displayName}</span>
                  <span className="truncate text-2xs text-fg-subtle">{user.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <Button variant="primary" size="sm" disabled={selected.length === 0 || isAdding} onClick={() => void add()}>
            {isAdding ? <Loader2 className="animate-spin" /> : <Plus />}
            {selected.length > 1 ? `Add ${selected.length} people` : "Add to team"}
          </Button>
          <p className="text-2xs text-fg-subtle">They join every channel this team has.</p>
        </div>
      </section>
    </div>
  );
}

function ChannelsTab({ team, refresh }: Pick<TabProps, "team" | "refresh">) {
  const [pick, setPick] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  const { data: inTeam, isPending } = useQuery({
    queryKey: ["team-channels", team.id],
    queryFn: () => teamService.channels(team.id),
  });
  const { data: all } = useQuery({ queryKey: ["admin-channels"], queryFn: () => adminService.listChannels() });

  const available = (all ?? []).filter((channel) => !channel.isArchived && channel.teamId !== team.id);

  const attach = async () => {
    if (!pick) return;
    setIsWorking(true);
    try {
      await teamService.attachChannel(team.id, pick);
      await refresh();
      setPick("");
      toast.success("Channel added to the team", { description: `The team's people are now in it.` });
    } catch (error) {
      toast.error("Could not add the channel", { description: errorText(error) });
    } finally {
      setIsWorking(false);
    }
  };

  const detach = async (channelId: string, name: string) => {
    try {
      await teamService.detachChannel(team.id, channelId);
      await refresh();
      toast.success("Channel taken out of the team", { description: `#${name} stays, with everyone in it.` });
    } catch (error) {
      toast.error("Could not remove the channel", { description: errorText(error) });
    }
  };

  return (
    <div className="space-y-5">
      <section aria-label="Channels in this team">
        <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
          In this team{inTeam ? ` · ${inTeam.length}` : ""}
        </h3>
        {isPending ? (
          <p className="py-3 text-xs text-fg-subtle">Loading…</p>
        ) : !inTeam?.length ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-fg-subtle">
            No channels yet. Add an existing one below, or create a new channel and choose this team.
          </p>
        ) : (
          <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border scrollbar-thin">
            {inTeam.map((channel) => (
              <li key={channel.id} className="flex items-center gap-2.5 px-2.5 py-1.5">
                <span className="text-fg-subtle">
                  {channel.kind === "private" ? <Lock className="size-3.5" aria-hidden /> : <Hash className="size-3.5" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{channel.name}</span>
                <span className="text-2xs text-fg-subtle">{channel.memberCount} people</span>
                <Button variant="ghost" size="sm" onClick={() => void detach(channel.id, channel.name)}>
                  Take out
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Add an existing channel">
        <Label htmlFor="team-add-channel" className="mb-1.5 block text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
          Add an existing channel
        </Label>
        <div className="flex gap-2">
          <select
            id="team-add-channel"
            value={pick}
            onChange={(event) => setPick(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm text-fg shadow-xs hover:border-border-strong focus-visible:border-accent"
          >
            <option value="">Choose a channel…</option>
            {available.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.kind === "private" ? "🔒 " : "# "}
                {channel.name}
                {channel.teamId ? " (in another team)" : ""}
              </option>
            ))}
          </select>
          <Button variant="primary" size="sm" disabled={!pick || isWorking} onClick={() => void attach()}>
            {isWorking ? <Loader2 className="animate-spin" /> : <Plus />}
            Add
          </Button>
        </div>
        <p className="mt-1.5 text-2xs text-fg-subtle">
          The team&apos;s people join it. Anyone already in it stays.
        </p>
      </section>
    </div>
  );
}

function DetailsTab({ team, refresh, setConfirm, onDeleted }: TabProps & { onDeleted: () => void }) {
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description);
  const [isSaving, setIsSaving] = useState(false);
  const dirty = name.trim() !== team.name || description.trim() !== team.description;

  const save = async () => {
    setIsSaving(true);
    try {
      await teamService.update(team.id, { name: name.trim(), description: description.trim() });
      await refresh();
      toast.success("Team updated");
    } catch (error) {
      toast.error("Could not save", { description: errorText(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const askToDelete = () =>
    setConfirm({
      title: `Delete the team “${team.name}”?`,
      destructive: true,
      confirmLabel: "Yes, delete it",
      cancelLabel: "No",
      description: (
        <>
          The team goes. Its {team.channelCount} {team.channelCount === 1 ? "channel stays" : "channels stay"} as
          ordinary channels, and everyone keeps the access they have now. Nothing is deleted from the
          conversations.
        </>
      ),
      onConfirm: async () => {
        try {
          await teamService.remove(team.id);
          await refresh();
          toast.success("Team deleted", { description: team.name });
          onDeleted();
        } catch (error) {
          toast.error("Could not delete the team", { description: errorText(error) });
          throw error;
        }
      },
    });

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="team-edit-name">Team name</Label>
        <Input id="team-edit-name" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="team-edit-description">What is it for?</Label>
        <Input
          id="team-edit-description"
          value={description}
          maxLength={250}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <Button variant="primary" size="sm" disabled={!dirty || !name.trim() || isSaving} onClick={() => void save()}>
        {isSaving && <Loader2 className="animate-spin" />}
        Save changes
      </Button>

      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium text-fg">Delete this team</h3>
        <p className="mb-2 mt-0.5 text-xs text-fg-muted">Its channels and conversations are kept.</p>
        <Button variant="danger-ghost" size="sm" onClick={askToDelete}>
          <Trash2 />
          Delete team
        </Button>
      </div>
    </div>
  );
}
