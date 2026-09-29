"use client";

import { UsersRound } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeams } from "@/hooks";
import { formatMembers } from "@/lib/format";
import type { Team } from "@/types";
import { AdminPage } from "./admin-page";
import { CreateTeamDialog } from "./create-team-dialog";
import { ManageTeamDialog } from "./manage-team-dialog";

export function TeamsAdmin() {
  const { data: teams, isPending } = useTeams();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [managedId, setManagedId] = useState<string | null>(null);
  // Looked up by id each render, so the open dialog follows the list as it refreshes.
  const managed = teams?.find((team) => team.id === managedId) ?? null;

  const createButton = (
    <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
      <UsersRound />
      Create team
    </Button>
  );

  return (
    <AdminPage
      title="Teams"
      description="Groups of people inside the workspace, each with channels of its own. Adding someone to a team puts them in all of its channels."
      actions={createButton}
    >
      <CreateTeamDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(team: Team) => setManagedId(team.id)}
      />
      <ManageTeamDialog team={managed} onClose={() => setManagedId(null)} />

      {isPending ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : !teams?.length ? (
        <div className="rounded-lg border border-dashed border-border bg-surface">
          <EmptyState
            icon={UsersRound}
            title="No teams yet"
            description="Create a team, add its people, and give it channels. Everyone you add joins those channels."
            action={createButton}
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {teams.map((team) => (
            <li
              key={team.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent-subtle text-accent" aria-hidden>
                <UsersRound className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{team.name}</p>
                <p className="truncate text-xs text-fg-muted">
                  {formatMembers(team.memberCount)} · {team.channelCount} {team.channelCount === 1 ? "channel" : "channels"}
                  {team.description ? ` · ${team.description}` : ""}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setManagedId(team.id)}>
                Manage
              </Button>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
