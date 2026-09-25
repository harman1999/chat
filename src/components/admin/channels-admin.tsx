"use client";

import { useQuery } from "@tanstack/react-query";
import { Archive, Hash, Lock, MoreHorizontal, Plus, UserCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserMap } from "@/hooks";
import { adminService, channelService } from "@/services";
import { useUIStore, useWorkspaceStore } from "@/store";
import { formatRelative } from "@/lib/format";
import type { Channel } from "@/types";
import { AdminPage } from "./admin-page";
import { DataTable, type Column } from "./data-table";

export function ChannelsAdmin() {
  const usersById = useUserMap();
  const router = useRouter();
  const setActiveConversation = useWorkspaceStore((state) => state.setActiveConversation);
  const openRightPanel = useUIStore((state) => state.openRightPanel);
  const setCreateChannelOpen = useUIStore((state) => state.setCreateChannelOpen);

  const { data, isPending, refetch } = useQuery({
    queryKey: ["admin-channels"],
    queryFn: () => adminService.listChannels(),
  });

  const columns: Column<Channel>[] = [
    {
      id: "name",
      header: "Channel",
      sortValue: (row) => row.name,
      searchValue: (row) => `${row.name} ${row.purpose}`,
      cell: (row) => (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 text-fg-subtle">
            {row.kind === "private" ? (
              <Lock className="size-3.5" aria-hidden />
            ) : (
              <Hash className="size-3.5" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{row.name}</p>
            <p className="truncate text-2xs text-fg-subtle">{row.purpose}</p>
          </div>
        </div>
      ),
    },
    {
      id: "visibility",
      header: "Visibility",
      sortValue: (row) => row.kind,
      cell: (row) => (
        <Badge variant={row.kind === "private" ? "warning" : "neutral"} size="sm" className="capitalize">
          {row.kind}
        </Badge>
      ),
    },
    {
      id: "members",
      header: "Members",
      align: "right",
      sortValue: (row) => row.memberCount,
      cell: (row) => (
        <span className="text-xs tabular-nums text-fg-muted">{row.memberCount.toLocaleString()}</span>
      ),
    },
    {
      id: "owner",
      header: "Created by",
      sortValue: (row) => usersById[row.createdBy]?.displayName ?? "",
      searchValue: (row) => usersById[row.createdBy]?.displayName ?? "",
      cell: (row) => (
        <span className="text-xs text-fg-muted">{usersById[row.createdBy]?.displayName ?? "—"}</span>
      ),
    },
    {
      id: "activity",
      header: "Last message",
      sortValue: (row) => (row.lastMessageAt ? Date.parse(row.lastMessageAt) : 0),
      cell: (row) => (
        <span className="text-2xs text-fg-muted">
          {row.lastMessageAt ? formatRelative(row.lastMessageAt) : "No activity"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      headerClassName: "w-10",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onSelect={() => {
                // Membership is managed in the workspace, where the picker and
                // the member list already live.
                setActiveConversation(row.id);
                openRightPanel("members");
                router.push("/workspace");
              }}
            >
              <UserCog />
              Manage members
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={row.isArchived}
              onSelect={async () => {
                try {
                  await channelService.setArchived(row.id, true);
                  await refetch();
                  toast.success("Channel archived", { description: `#${row.name}` });
                } catch {
                  toast.error("Could not archive channel", {
                    description: "You may not have permission.",
                  });
                }
              }}
            >
              <Archive />
              Archive channel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <AdminPage
      title="Channels"
      description="Every channel in the workspace, including ones you are not a member of."
      actions={
        <Button variant="primary" size="sm" onClick={() => setCreateChannelOpen(true)}>
          <Plus />
          Create channel
        </Button>
      }
    >
      <DataTable
        rows={data ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        isPending={isPending}
        searchPlaceholder="Search channels"
        emptyTitle="No channels yet"
      />
    </AdminPage>
  );
}
