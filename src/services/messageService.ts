import type { ID, Message, Paginated } from "@/types";
import { currentUserId, messagesByChannel, repliesByRootId } from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export interface SendMessageInput {
  channelId: ID;
  body: string;
  threadRootId?: ID | null;
  attachmentIds?: ID[];
}

/** Matches the page size the API will use, so scroll behaviour stays identical. */
export const MESSAGE_PAGE_SIZE = 40;

/**
 * Messages are paginated backwards from newest: the first page is the tail of
 * the channel, and `nextCursor` is the id of the oldest item returned. Items
 * always come back in ascending chronological order.
 */
export const messageService = {
  async list(channelId: ID, cursor?: string | null): Promise<Paginated<Message>> {
    if (!USE_MOCK_TRANSPORT) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return request<Paginated<Message>>(`/channels/${channelId}/messages${query}`);
    }

    const all = messagesByChannel[channelId] ?? [];
    const end = cursor ? all.findIndex((message) => message.id === cursor) : all.length;
    const safeEnd = end < 0 ? all.length : end;
    const start = Math.max(0, safeEnd - MESSAGE_PAGE_SIZE);
    const items = all.slice(start, safeEnd);

    return mockResolve(
      {
        items,
        nextCursor: start > 0 ? items[0]?.id ?? null : null,
        hasMore: start > 0,
      },
      cursor ? 380 : 260,
    );
  },

  /** Messages the user has saved for later, newest first. */
  async listSaved(): Promise<Message[]> {
    if (!USE_MOCK_TRANSPORT) return request<Message[]>("/me/saved");

    const matches: Message[] = [];
    for (const list of Object.values(messagesByChannel)) {
      for (const message of list) if (message.isSaved) matches.push(message);
    }
    matches.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return mockResolve(matches, 200);
  },

  /** Every message that mentions the signed-in user, newest first. */
  async listMentions(): Promise<Message[]> {
    if (!USE_MOCK_TRANSPORT) return request<Message[]>("/me/mentions");

    const matches: Message[] = [];
    for (const list of Object.values(messagesByChannel)) {
      for (const message of list) {
        if (message.mentionedUserIds.includes(currentUserId)) matches.push(message);
      }
    }
    for (const list of Object.values(repliesByRootId)) {
      for (const message of list) {
        if (message.mentionedUserIds.includes(currentUserId)) matches.push(message);
      }
    }

    matches.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return mockResolve(matches, 220);
  },

  async listThread(rootId: ID): Promise<Message[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(repliesByRootId[rootId] ?? []);
    return request<Message[]>(`/messages/${rootId}/replies`);
  },

  async send(input: SendMessageInput): Promise<Message | null> {
    if (USE_MOCK_TRANSPORT) return mockResolve(null, 240);
    return request<Message>(`/channels/${input.channelId}/messages`, { method: "POST", body: input });
  },

  async update(id: ID, body: string): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 160);
    return request<void>(`/messages/${id}`, { method: "PATCH", body: { body } });
  },

  async remove(id: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 160);
    return request<void>(`/messages/${id}`, { method: "DELETE" });
  },

  async addReaction(id: ID, emoji: string): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 90);
    return request<void>(`/messages/${id}/reactions`, { method: "POST", body: { emoji } });
  },

  async removeReaction(id: ID, emoji: string): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 90);
    return request<void>(`/messages/${id}/reactions/${encodeURIComponent(emoji)}`, { method: "DELETE" });
  },

  async setPinned(id: ID, isPinned: boolean): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 120);
    return request<void>(`/messages/${id}/pin`, { method: "PUT", body: { isPinned } });
  },

  async setSaved(id: ID, isSaved: boolean): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 120);
    return request<void>(`/messages/${id}/save`, { method: "PUT", body: { isSaved } });
  },
};
