"use client";

import { BellOff, Hash, Lock } from "lucide-react";
import { UnreadBadge } from "@/components/common";
import { useUIStore, useWorkspaceStore } from "@/store";
import type { Channel } from "@/types";
import { SidebarItem } from "./sidebar-item";

export function ChannelItem({ channel, isCollapsed }: { channel: Channel; isCollapsed?: boolean }) {
  const activeId = useWorkspaceStore((state) => state.activeConversationId);
  const setActive = useWorkspaceStore((state) => state.setActiveConversation);
  const closeDrawer = useUIStore((state) => state.setSidebarDrawerOpen);

  const isActive = activeId === channel.id;
  const hasUnread = channel.unreadCount > 0 && !channel.isMuted;
  const Glyph = channel.kind === "private" ? Lock : Hash;

  return (
    <SidebarItem
      leading={<Glyph strokeWidth={2.25} />}
      // A column of identical hashes is unreadable, so the rail shows initials.
      collapsedLeading={
        channel.kind === "private" ? (
          <Glyph strokeWidth={2.25} />
        ) : (
          <span className="grid size-5 place-items-center rounded-[5px] border border-sidebar-border bg-sidebar-elevated text-[0.625rem] font-semibold uppercase">
            {channel.name.slice(0, 2)}
          </span>
        )
      }
      label={channel.name}
      isActive={isActive}
      isUnread={hasUnread || channel.mentionCount > 0}
      isMuted={channel.isMuted}
      isCollapsed={isCollapsed}
      onClick={() => {
        setActive(channel.id);
        closeDrawer(false);
      }}
      trailing={
        <>
          {channel.isMuted && channel.mentionCount === 0 && (
            <BellOff className="size-3 text-sidebar-subtle" aria-label="Muted" />
          )}
          {channel.mentionCount > 0 ? (
            <UnreadBadge count={channel.mentionCount} />
          ) : (
            hasUnread && <UnreadBadge count={channel.unreadCount} tone="unread" />
          )}
        </>
      }
    />
  );
}
