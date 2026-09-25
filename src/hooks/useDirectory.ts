"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { channelService, userService } from "@/services";
import type { Channel, ID, User } from "@/types";
import { useCurrentUser } from "./useCurrentUser";
import { useWorkspaceStore } from "@/store";

/**
 * Workspace directory.
 *
 * Replaces the `usersById` fixture map, which held 10 people while the database
 * holds 58 — so any message from someone outside the fixture set rendered as
 * "Unknown". One cached query serves every lookup in the tree.
 */
export function useUsers() {
  return useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => userService.list(),
    staleTime: 5 * 60_000,
  });
}

const EMPTY_USERS: Record<ID, User> = {};

/** `id → User`, memoised so consumers keep a stable reference. */
export function useUserMap(): Record<ID, User> {
  const { data } = useUsers();

  return useMemo(() => {
    if (!data) return EMPTY_USERS;
    return Object.fromEntries(data.map((user) => [user.id, user]));
  }, [data]);
}

export function useUser(id: ID | null | undefined): User | undefined {
  const byId = useUserMap();
  return id ? byId[id] : undefined;
}

/**
 * The signed-in user's id, or undefined until the session resolves.
 *
 * Every ownership and "did I react" check reads this. It used to be the module
 * constant `currentUserId`, so the UI believed it was one particular person no
 * matter who signed in.
 */
export function useCurrentUserId(): ID | undefined {
  return useCurrentUser().data?.id;
}

const EMPTY_CONVERSATIONS: Record<ID, Channel> = {};

/**
 * `id → Channel` across channels and DMs. Both queries are already warm from
 * the sidebar, so this costs nothing extra.
 */
export function useConversationMap(): Record<ID, Channel> {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);

  const channels = useQuery<Channel[]>({
    queryKey: ["channels", workspaceId],
    queryFn: () => channelService.listChannels(workspaceId),
  });
  const dms = useQuery<Channel[]>({
    queryKey: ["dms", workspaceId],
    queryFn: () => channelService.listDirectMessages(workspaceId),
  });

  return useMemo(() => {
    const all = [...(channels.data ?? []), ...(dms.data ?? [])];
    if (all.length === 0) return EMPTY_CONVERSATIONS;
    return Object.fromEntries(all.map((conversation) => [conversation.id, conversation]));
  }, [channels.data, dms.data]);
}
