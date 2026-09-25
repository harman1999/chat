import type { Channel, ID, User } from "@/types";
import { allConversations, channels, conversationsById, directMessages, usersById } from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export const channelService = {
  async listChannels(workspaceId: ID): Promise<Channel[]> {
    if (USE_MOCK_TRANSPORT) {
      return mockResolve(channels.filter((channel) => channel.workspaceId === workspaceId));
    }
    return request<Channel[]>(`/workspaces/${workspaceId}/channels`);
  },

  async listDirectMessages(workspaceId: ID): Promise<Channel[]> {
    if (USE_MOCK_TRANSPORT) {
      return mockResolve(directMessages.filter((dm) => dm.workspaceId === workspaceId));
    }
    return request<Channel[]>(`/workspaces/${workspaceId}/dms`);
  },

  async get(id: ID): Promise<Channel | null> {
    if (USE_MOCK_TRANSPORT) return mockResolve(conversationsById[id] ?? null);
    return request<Channel>(`/channels/${id}`);
  },

  async members(id: ID): Promise<User[]> {
    if (USE_MOCK_TRANSPORT) {
      const channel = conversationsById[id];
      return mockResolve((channel?.memberIds ?? []).map((memberId) => usersById[memberId]).filter(Boolean));
    }
    return request<User[]>(`/channels/${id}/members`);
  },

  async create(input: {
    name: string;
    purpose?: string;
    kind?: "public" | "private";
    memberIds?: ID[];
  }): Promise<Channel | null> {
    if (USE_MOCK_TRANSPORT) return mockResolve(null, 240);
    return request<Channel>("/channels", { method: "POST", body: input });
  },

  async addMembers(id: ID, userIds: ID[]): Promise<{ added: ID[] }> {
    if (USE_MOCK_TRANSPORT) return mockResolve({ added: userIds }, 200);
    return request<{ added: ID[] }>(`/channels/${id}/members`, {
      method: "POST",
      body: { userIds },
    });
  },

  async removeMember(id: ID, userId: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 160);
    return request<void>(`/channels/${id}/members/${userId}`, { method: "DELETE" });
  },

  /** `me` leaves the channel. */
  async leave(id: ID): Promise<void> {
    return channelService.removeMember(id, "me");
  },

  async setArchived(id: ID, isArchived: boolean): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    return request<void>(`/channels/${id}/archive`, { method: "PUT", body: { isArchived } });
  },

  async setFavorite(id: ID, isFavorite: boolean): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 60);
    return request<void>(`/channels/${id}/favorite`, { method: "PUT", body: { isFavorite } });
  },

  async markRead(id: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 40);
    return request<void>(`/channels/${id}/read`, { method: "POST" });
  },

  /** Convenience for search / jump-to dialogs. */
  async searchConversations(query: string): Promise<Channel[]> {
    const needle = query.trim().toLowerCase();
    if (USE_MOCK_TRANSPORT) {
      return mockResolve(
        needle
          ? allConversations.filter((conversation) => conversation.name.toLowerCase().includes(needle))
          : allConversations,
        120,
      );
    }
    return request<Channel[]>(`/search?q=${encodeURIComponent(query)}&kinds=channel`);
  },
};
