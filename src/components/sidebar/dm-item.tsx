"use client";

import { UnreadBadge, UserAvatar } from "@/components/common";
import { useUserMap } from "@/hooks";
import { useUIStore, useWorkspaceStore } from "@/store";
import type { Channel, User } from "@/types";
import { SidebarItem } from "./sidebar-item";

/** Group DMs stack the participant count instead of a single avatar. */
function GroupGlyph({ count }: { count: number }) {
  return (
    <span className="grid size-5 place-items-center rounded-[5px] border border-sidebar-border bg-sidebar-elevated text-[0.625rem] font-semibold text-sidebar-muted">
      {count}
    </span>
  );
}

export function DirectMessageItem({
  conversation,
  isCollapsed,
}: {
  conversation: Channel;
  isCollapsed?: boolean;
}) {
  const activeId = useWorkspaceStore((state) => state.activeConversationId);
  const setActive = useWorkspaceStore((state) => state.setActiveConversation);
  const closeDrawer = useUIStore((state) => state.setSidebarDrawerOpen);
  const usersById = useUserMap();

  const participants = (conversation.participantIds ?? [])
    .map((id) => usersById[id])
    .filter(Boolean) as User[];
  const [primary] = participants;
  const isGroup = conversation.kind === "group_dm";
  const hasUnread = conversation.unreadCount > 0;

  return (
    <SidebarItem
      leading={
        isGroup || !primary ? (
          <GroupGlyph count={participants.length} />
        ) : (
          <UserAvatar
            user={primary}
            size="xs"
            showPresence
            ringClassName="border-sidebar"
            className="[&_span]:leading-none"
          />
        )
      }
      label={primary && !isGroup ? primary.displayName : conversation.name}
      isActive={activeId === conversation.id}
      isUnread={hasUnread}
      isCollapsed={isCollapsed}
      onClick={() => {
        setActive(conversation.id);
        closeDrawer(false);
      }}
      trailing={
        conversation.mentionCount > 0 ? (
          <UnreadBadge count={conversation.mentionCount} />
        ) : (
          hasUnread && <UnreadBadge count={conversation.unreadCount} tone="unread" />
        )
      }
    />
  );
}
