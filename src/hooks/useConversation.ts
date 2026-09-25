"use client";

import { useQuery } from "@tanstack/react-query";
import { channelService } from "@/services";
import type { Channel } from "@/types";
import { useWorkspaceStore } from "@/store";

/** Resolves a conversation by id. Backed by mocks today, the REST API later. */
export function useConversation(conversationId: string) {
  return useQuery<Channel | null>({
    queryKey: ["conversation", conversationId],
    queryFn: () => channelService.get(conversationId),
    enabled: Boolean(conversationId),
  });
}

/** The conversation currently selected in the workspace store. */
export function useActiveConversation() {
  const conversationId = useWorkspaceStore((state) => state.activeConversationId);
  return useConversation(conversationId);
}
