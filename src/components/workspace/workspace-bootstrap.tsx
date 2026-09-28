"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { channelService, workspaceService } from "@/services";
import { useWorkspaceStore } from "@/store";

/**
 * Seeds the workspace store from the API.
 *
 * The store used to start with fixture ids baked in, which meant a signed-in
 * user's first render pointed at whichever workspace and channel the fixtures
 * happened to name. Now both come from the session.
 */
export function WorkspaceBootstrap() {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const activeConversationId = useWorkspaceStore((state) => state.activeConversationId);

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => workspaceService.listMine(),
    staleTime: 5 * 60_000,
  });

  const { data: channels } = useQuery({
    queryKey: ["channels", workspaceId],
    queryFn: () => channelService.listChannels(workspaceId),
    enabled: Boolean(workspaceId),
  });

  // Same key the sidebar uses, so this is served from its cache rather than
  // being a second request.
  const { data: directMessages } = useQuery({
    queryKey: ["dms", workspaceId],
    queryFn: () => channelService.listDirectMessages(workspaceId),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    // Always the workspace the session is in. The list also names others
    // this email has accounts in, but those are reached by switching, which
    // signs in to them — never by pointing the store at them.
    const current = workspaces?.find((workspace) => workspace.isCurrent) ?? workspaces?.[0];
    if (current && current.id !== workspaceId) {
      useWorkspaceStore.getState().setWorkspace(current.id);
    }
  }, [workspaceId, workspaces]);

  useEffect(() => {
    // Both lists must be in before judging the selection. Deciding on channels
    // alone is what made every direct message unopenable: a DM id is never in
    // the channel list, so selecting one was immediately "corrected" back to the
    // first channel.
    if (!channels?.length || !directMessages) return;

    const isKnown = (id: string) =>
      channels.some((channel) => channel.id === id) ||
      directMessages.some((conversation) => conversation.id === id);

    if (isKnown(activeConversationId)) return;
    useWorkspaceStore.getState().setActiveConversation(channels[0].id);
  }, [activeConversationId, channels, directMessages]);

  return null;
}
