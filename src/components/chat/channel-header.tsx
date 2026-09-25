"use client";

import {
  Archive,
  Bell,
  BellOff,
  Hash,
  Info,
  Loader2,
  LogOut,
  Lock,
  MoreHorizontal,
  PanelRight,
  Phone,
  Pin,
  Star,
  UserPlus,
  Video,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Hint } from "@/components/ui/tooltip";
import { useUserMap } from "@/hooks";
import { channelService } from "@/services";
import { cn } from "@/lib/utils";
import { useUIStore, useWorkspaceStore } from "@/store";
import type { Channel } from "@/types";

export function ChannelHeader({ conversation }: { conversation: Channel }) {
  const openRightPanel = useUIStore((state) => state.openRightPanel);
  const toggleRightPanel = useUIStore((state) => state.toggleRightPanel);
  const setDetailsSheetOpen = useUIStore((state) => state.setDetailsSheetOpen);

  const usersById = useUserMap();
  const queryClient = useQueryClient();
  const setActiveConversation = useWorkspaceStore((state) => state.setActiveConversation);
  const setAddPeopleOpen = useUIStore((state) => state.setAddPeopleOpen);

  const [isFavorite, setIsFavorite] = useState(conversation.isFavorite);
  const [isMuted, setIsMuted] = useState(conversation.isMuted);
  const [pendingAction, setPendingAction] = useState<"archive" | "leave" | null>(null);

  const refreshChannels = () => queryClient.invalidateQueries({ queryKey: ["channels"] });

  const archive = async () => {
    setPendingAction("archive");
    try {
      await channelService.setArchived(conversation.id, true);
      await refreshChannels();
      toast.success("Channel archived", {
        description: `#${conversation.name} is now read-only.`,
      });
    } catch {
      toast.error("Could not archive channel", { description: "You may not have permission." });
    } finally {
      setPendingAction(null);
    }
  };

  const leave = async () => {
    setPendingAction("leave");
    try {
      await channelService.leave(conversation.id);
      const remaining = await queryClient.fetchQuery({
        queryKey: ["channels", conversation.workspaceId],
        queryFn: () => channelService.listChannels(conversation.workspaceId),
      });
      // Move somewhere that still exists, or the view points at a channel the
      // viewer can no longer read.
      const next = remaining.find((channel) => channel.id !== conversation.id);
      if (next) setActiveConversation(next.id);
      toast.success("You left the channel", { description: `#${conversation.name}` });
    } catch {
      toast.error("Could not leave channel");
    } finally {
      setPendingAction(null);
    }
  };

  const isChannel = conversation.kind === "public" || conversation.kind === "private";
  const Glyph = conversation.kind === "private" ? Lock : Hash;
  const members = conversation.memberIds.map((id) => usersById[id]).filter(Boolean).slice(0, 3);

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="flex min-w-0 items-center gap-1 text-md font-semibold tracking-tight text-fg">
            {isChannel && <Glyph className="size-4 shrink-0 text-fg-subtle" aria-hidden />}
            <span className="truncate">{conversation.name}</span>
          </h1>

          <Hint label={isFavorite ? "Remove from favourites" : "Add to favourites"}>
            <button
              type="button"
              aria-label={isFavorite ? "Remove from favourites" : "Add to favourites"}
              aria-pressed={isFavorite}
              onClick={() => {
                const next = !isFavorite;
                setIsFavorite(next);
                void channelService.setFavorite(conversation.id, next);
              }}
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-surface-hover",
                isFavorite ? "text-warning" : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              <Star className={cn("size-3.5", isFavorite && "fill-current")} />
            </button>
          </Hint>

          {conversation.purpose && (
            <p className="hidden min-w-0 truncate border-l border-border pl-2 text-xs text-fg-muted lg:block">
              {conversation.purpose}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {isChannel && (
          <Hint label="View members">
            <button
              type="button"
              onClick={() => openRightPanel("members")}
              aria-label={`${conversation.memberCount} members`}
              className="hidden h-7 items-center gap-1.5 rounded-md border border-border px-1.5 transition-colors hover:border-border-strong hover:bg-surface-hover sm:flex"
            >
              <span className="flex -space-x-1.5">
                {members.map((member) => (
                  <UserAvatar key={member.id} user={member} size="xs" ringClassName="border-surface" />
                ))}
              </span>
              <span className="text-2xs font-semibold tabular-nums text-fg-muted">
                {conversation.memberCount.toLocaleString()}
              </span>
            </button>
          </Hint>
        )}

        <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />

        {/* Calling is specified as a placeholder. Disabled and labelled rather
            than silently inert, so the control does not promise anything. */}
        <Hint label="Calls are not available yet">
          <span className="hidden sm:inline-flex">
            <Button variant="ghost" size="icon-sm" aria-label="Start a call — not available yet" disabled>
              <Phone />
            </Button>
          </span>
        </Hint>
        <Hint label="Video meetings are not available yet">
          <span className="hidden sm:inline-flex">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Start a video meeting — not available yet"
              disabled
            >
              <Video />
            </Button>
          </span>
        </Hint>
        <Hint label="Pinned messages">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Pinned messages"
            onClick={() => openRightPanel("pinned")}
          >
            <Pin />
          </Button>
        </Hint>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Conversation options">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => openRightPanel("details")}>
              <Info />
              View conversation details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAddPeopleOpen(true)} disabled={!isChannel}>
              <UserPlus />
              Add people
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const next = !isMuted;
                setIsMuted(next);
                toast.success(next ? "Notifications muted" : "Notifications unmuted");
              }}
            >
              {isMuted ? <Bell /> : <BellOff />}
              {isMuted ? "Unmute conversation" : "Mute conversation"}
            </DropdownMenuItem>
            {isChannel && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={pendingAction !== null}
                  onSelect={(event) => {
                    event.preventDefault();
                    void archive();
                  }}
                >
                  {pendingAction === "archive" ? <Loader2 className="animate-spin" /> : <Archive />}
                  Archive channel
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="danger"
                  disabled={pendingAction !== null}
                  onSelect={(event) => {
                    event.preventDefault();
                    void leave();
                  }}
                >
                  {pendingAction === "leave" ? <Loader2 className="animate-spin" /> : <LogOut />}
                  Leave channel
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Hint label="Conversation details">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Show conversation details"
            className="xl:hidden"
            onClick={() => setDetailsSheetOpen(true)}
          >
            <Info />
          </Button>
        </Hint>
        <Hint label="Toggle details panel" shortcut="⌘.">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Toggle details panel"
            className="hidden xl:inline-flex"
            onClick={toggleRightPanel}
          >
            <PanelRight />
          </Button>
        </Hint>
      </div>
    </header>
  );
}
