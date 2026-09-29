"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { ListSkeleton } from "@/components/common";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTeams } from "@/hooks";
import { ALL_TEAMS, NO_TEAM, sectionChannels } from "@/lib/team-filter";
import { channelService, workspaceService } from "@/services";
import { useUIStore, useWorkspaceStore } from "@/store";
import { cn } from "@/lib/utils";
import { ChannelItem } from "./channel-item";
import { DirectMessageItem } from "./dm-item";
import { SidebarGroup } from "./sidebar-group";
import { SidebarNav } from "./sidebar-nav";
import { TeamFilter } from "./team-filter";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * The workspace sidebar. Rendered inline on desktop and inside a drawer on
 * small screens, so it takes `isCollapsed` and `onClose` rather than reading
 * viewport state itself. The collapse toggle lives in the top bar, beside the
 * workspace switcher.
 */
export function WorkspaceSidebar({
  isCollapsed = false,
  onClose,
  className,
}: {
  isCollapsed?: boolean;
  /** Renders a close control — used when the sidebar is inside the mobile drawer. */
  onClose?: () => void;
  className?: string;
}) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const collapsedGroups = useWorkspaceStore((state) => state.collapsedGroups);
  const teamFilter = useWorkspaceStore((state) => state.teamFilter);
  const setTeamFilter = useWorkspaceStore((state) => state.setTeamFilter);
  const toggleGroup = useWorkspaceStore((state) => state.toggleGroup);
  const openCreateChannel = useUIStore((state) => state.setCreateChannelOpen);
  const openNewDirectMessage = useUIStore((state) => state.setNewDirectMessageOpen);

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => workspaceService.listMine(),
    staleTime: 5 * 60_000,
  });

  const channelsQuery = useQuery({
    queryKey: ["channels", workspaceId],
    queryFn: () => channelService.listChannels(workspaceId),
  });

  const dmQuery = useQuery({
    queryKey: ["dms", workspaceId],
    queryFn: () => channelService.listDirectMessages(workspaceId),
  });

  // Channels that belong to a team sit under that team's name, so what a team
  // is working on is together; the rest stay under Channels. The team filter
  // narrows this to one team. The narrow rail has no room to show a picker, so
  // it always shows everything rather than filter by a choice you cannot see.
  const teamsQuery = useTeams();
  const sections = sectionChannels(channelsQuery.data ?? [], teamsQuery.data ?? [], isCollapsed ? "all" : teamFilter);
  const showTeamFilter = !isCollapsed && sections.options.length > 0;
  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-fg",
        isCollapsed ? "w-16" : "w-full",
        className,
      )}
      data-collapsed={isCollapsed || undefined}
    >
      {/* The workspace switcher lives in the top bar on desktop. Only the
          mobile drawer, which has no top bar beside it, keeps it here. */}
      {onClose && (
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-sidebar-border pl-2 pr-1.5">
          <div className="min-w-0 flex-1">
            <WorkspaceSwitcher workspaces={workspacesQuery.data ?? []} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid size-7 shrink-0 place-items-center rounded-md text-sidebar-subtle transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg focus-sidebar"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <ScrollArea
        variant="sidebar"
        className={cn("flex-1 py-2", isCollapsed ? "px-2" : "px-2")}
      >
        <SidebarNav isCollapsed={isCollapsed} />

        <div className="h-3" />

        {showTeamFilter && (
          <>
            <TeamFilter
              teams={sections.options}
              value={sections.filter}
              onChange={setTeamFilter}
              hidden={sections.hidden}
              badges={sections.badges}
            />
            <div className="h-2" />
          </>
        )}

        {/* Channels without a team. Hidden while one team is chosen: they are not that team's. */}
        {(sections.filter === ALL_TEAMS || sections.filter === NO_TEAM) && (
          <SidebarGroup
            id="channels"
            title="Channels"
            isCollapsed={isCollapsed}
            isOpen={!collapsedGroups.channels}
            onToggle={() => toggleGroup("channels")}
            onAdd={() => openCreateChannel(true)}
            addLabel="Create a channel"
          >
            {channelsQuery.isPending ? (
              <ListSkeleton rows={6} />
            ) : (
              <>
                {sections.loose.map((channel) => (
                  <ChannelItem key={channel.id} channel={channel} isCollapsed={isCollapsed} />
                ))}
                {!isCollapsed && (
                  <button
                    type="button"
                    onClick={() => openCreateChannel(true)}
                    className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-subtle transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg focus-sidebar"
                  >
                    <Plus className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">Add channels</span>
                  </button>
                )}
              </>
            )}
          </SidebarGroup>
        )}


        {sections.teams.map(({ team, channels }) => (
          <div key={team.id}>
            <div className="h-3" />
            <SidebarGroup
              id={`team-${team.id}`}
              title={team.name}
              isCollapsed={isCollapsed}
              isOpen={!collapsedGroups[`team-${team.id}`]}
              onToggle={() => toggleGroup(`team-${team.id}`)}
            >
              {channels.map((channel) => (
                <ChannelItem key={channel.id} channel={channel} isCollapsed={isCollapsed} />
              ))}
              {channels.length === 0 && !isCollapsed && (
                <p className="px-2 py-1.5 text-xs text-sidebar-subtle">No channels in {team.name} yet.</p>
              )}
            </SidebarGroup>
          </div>
        ))}

        <div className="h-3" />

        <SidebarGroup
          id="dms"
          title="Direct messages"
          isCollapsed={isCollapsed}
          isOpen={!collapsedGroups.dms}
          onToggle={() => toggleGroup("dms")}
          onAdd={() => openNewDirectMessage(true)}
          addLabel="Start a direct message"
        >
          {dmQuery.isPending ? (
            <ListSkeleton rows={4} />
          ) : (
            <>
              {dmQuery.data?.map((conversation) => (
                <DirectMessageItem
                  key={conversation.id}
                  conversation={conversation}
                  isCollapsed={isCollapsed}
                />
              ))}
              {!isCollapsed && (
                <button
                  type="button"
                  onClick={() => openNewDirectMessage(true)}
                  className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-subtle transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg focus-sidebar"
                >
                  <Plus className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">New message</span>
                </button>
              )}
            </>
          )}
        </SidebarGroup>

        <div className="h-4" />
      </ScrollArea>
    </div>
  );
}
