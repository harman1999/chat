"use client";

import { useQuery } from "@tanstack/react-query";
import { channelService } from "@/services";
import { ALL_TEAMS, NO_TEAM, sectionChannels, type ChannelSections } from "@/lib/team-filter";
import { useUIStore, useWorkspaceStore } from "@/store";
import { useTeams } from "./useTeams";

/**
 * What the team column needs, and whether it is showing at all.
 *
 * The shell (which makes room for it) and the top bar (which lines its own left
 * edge up with it) both ask, so they cannot disagree. It shows on the wide
 * sidebar only, and only for someone who is in a team or can see one's
 * channels: with no teams there is nothing to choose between. In the narrow
 * icon rail there is no room, so it always shows everything.
 */
export function useTeamRail(): {
  isVisible: boolean;
  sections: ChannelSections;
  /** Chooses a team, and takes you into it. */
  select: (filter: string) => void;
} {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const teamFilter = useWorkspaceStore((state) => state.teamFilter);
  const setFilter = useWorkspaceStore((state) => state.setTeamFilter);
  const activeConversationId = useWorkspaceStore((state) => state.activeConversationId);
  const setActiveConversation = useWorkspaceStore((state) => state.setActiveConversation);
  const isCollapsed = useUIStore((state) => state.isSidebarCollapsed);

  // The same keys the sidebar uses, so this costs no extra request.
  const { data: channels } = useQuery({
    queryKey: ["channels", workspaceId],
    queryFn: () => channelService.listChannels(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const { data: teams } = useTeams();

  const sections = sectionChannels(channels ?? [], teams ?? [], isCollapsed ? "all" : teamFilter);

  const select = (filter: string) => {
    setFilter(filter);
    if (filter === ALL_TEAMS || filter === NO_TEAM) return;

    // Choosing a team should land you in it. Leaving a channel from another team
    // open in the middle, beside a list that does not contain it, reads as
    // though nothing happened. Keep the current channel if it is this team's;
    // otherwise open the one that most needs you: a mention, then unread, then
    // the first.
    const mine = (channels ?? []).filter((channel) => channel.teamId === filter);
    if (mine.length === 0 || mine.some((channel) => channel.id === activeConversationId)) return;
    const target =
      mine.find((channel) => channel.mentionCount > 0) ??
      mine.find((channel) => channel.unreadCount > 0 && !channel.isMuted) ??
      mine[0];
    setActiveConversation(target.id);
  };

  return { isVisible: !isCollapsed && sections.options.length > 0, sections, select };
}
