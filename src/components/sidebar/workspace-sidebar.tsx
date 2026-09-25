"use client";

import { useQuery } from "@tanstack/react-query";
import { PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { ListSkeleton } from "@/components/common";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hint } from "@/components/ui/tooltip";

import { channelService, workspaceService } from "@/services";
import { useUIStore, useWorkspaceStore } from "@/store";
import { cn } from "@/lib/utils";
import { ChannelItem } from "./channel-item";
import { DirectMessageItem } from "./dm-item";
import { SidebarGroup } from "./sidebar-group";
import { SidebarNav } from "./sidebar-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * The workspace sidebar. Rendered inline on desktop and inside a drawer on
 * small screens, so it takes `isCollapsed` and `showCollapseToggle` rather than
 * reading viewport state itself.
 */
export function WorkspaceSidebar({
  isCollapsed = false,
  showCollapseToggle = true,
  onClose,
  className,
}: {
  isCollapsed?: boolean;
  showCollapseToggle?: boolean;
  /** Renders a close control — used when the sidebar is inside the mobile drawer. */
  onClose?: () => void;
  className?: string;
}) {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const collapsedGroups = useWorkspaceStore((state) => state.collapsedGroups);
  const toggleGroup = useWorkspaceStore((state) => state.toggleGroup);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const openCreateChannel = useUIStore((state) => state.setCreateChannelOpen);

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

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-fg",
        isCollapsed ? "w-16" : "w-full",
        className,
      )}
      data-collapsed={isCollapsed || undefined}
    >
      {/* Workspace header */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 border-b border-sidebar-border",
          isCollapsed ? "flex-col px-2 py-2" : "h-14 pl-2 pr-1.5",
        )}
      >
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher workspaces={workspacesQuery.data ?? []} isCollapsed={isCollapsed} />
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid size-7 shrink-0 place-items-center rounded-md text-sidebar-subtle transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg focus-sidebar"
          >
            <X className="size-4" />
          </button>
        )}
        {showCollapseToggle && (
          <Hint
            label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            shortcut="⌘B"
            side={isCollapsed ? "right" : "bottom"}
          >
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={isCollapsed}
              className="grid size-7 shrink-0 place-items-center rounded-md text-sidebar-subtle transition-colors hover:bg-sidebar-hover hover:text-sidebar-fg focus-sidebar"
            >
              {isCollapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          </Hint>
        )}
      </div>

      <ScrollArea
        variant="sidebar"
        className={cn("flex-1 py-2", isCollapsed ? "px-2" : "px-2")}
      >
        <SidebarNav isCollapsed={isCollapsed} />

        <div className="h-3" />

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
              {channelsQuery.data?.map((channel) => (
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

        <div className="h-3" />

        <SidebarGroup
          id="dms"
          title="Direct messages"
          isCollapsed={isCollapsed}
          isOpen={!collapsedGroups.dms}
          onToggle={() => toggleGroup("dms")}
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

            </>
          )}
        </SidebarGroup>

        <div className="h-4" />
      </ScrollArea>
    </div>
  );
}
