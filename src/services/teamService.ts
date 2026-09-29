import type { ID, Team, User } from "@/types";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export interface TeamChannel {
  id: ID;
  name: string;
  kind: "public" | "private";
  memberCount: number;
}

export const teamService = {
  /** Every team in the workspace, marking the ones you are in. */
  async list(): Promise<Team[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve([], 120);
    return request<Team[]>("/teams");
  },

  async create(input: { name: string; description?: string; memberIds?: ID[] }): Promise<Team> {
    if (USE_MOCK_TRANSPORT) {
      return mockResolve(
        { id: "team_mock", name: input.name, description: input.description ?? "", memberCount: 0, channelCount: 0, isMember: false, createdAt: new Date().toISOString() },
        240,
      );
    }
    return request<Team>("/teams", { method: "POST", body: input });
  },

  async update(id: ID, patch: { name?: string; description?: string }): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    return request<void>(`/teams/${id}`, { method: "PATCH", body: patch });
  },

  /** Its channels stay, as ordinary channels, with everyone still in them. */
  async remove(id: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    return request<void>(`/teams/${id}`, { method: "DELETE" });
  },

  async members(id: ID): Promise<User[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve([], 120);
    return request<User[]>(`/teams/${id}/members`);
  },

  /** Adds people to the team, and so to every channel it has. */
  async addMembers(id: ID, userIds: ID[]): Promise<{ added: ID[] }> {
    if (USE_MOCK_TRANSPORT) return mockResolve({ added: userIds }, 200);
    return request<{ added: ID[] }>(`/teams/${id}/members`, { method: "POST", body: { userIds } });
  },

  /** Takes them out of the team and out of its channels. */
  async removeMember(id: ID, userId: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    return request<void>(`/teams/${id}/members/${userId}`, { method: "DELETE" });
  },

  async channels(id: ID): Promise<TeamChannel[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve([], 120);
    return request<TeamChannel[]>(`/teams/${id}/channels`);
  },

  /** Puts an existing channel in the team, and the team's people in the channel. */
  async attachChannel(id: ID, channelId: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    return request<void>(`/teams/${id}/channels/${channelId}`, { method: "PUT" });
  },

  /** Everyone in the channel stays; only the grouping goes. */
  async detachChannel(id: ID, channelId: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    return request<void>(`/teams/${id}/channels/${channelId}`, { method: "DELETE" });
  },
};
