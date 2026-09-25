import type { Channel, ID, Message, Paginated, Thread } from "@/types";
import {
  conversationsById,
  messagesByChannel,
  repliesByRootId,
  threads,
  threadsByRootId,
} from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

/**
 * A row in the Threads inbox. The API will return this shape directly — the
 * client should never have to walk channel history to build it.
 */
export interface ThreadInboxEntry {
  thread: Thread;
  root: Message;
  /** Tail of the reply list, enough to preview the conversation. */
  recentReplies: Message[];
  channel: Channel;
}

function findMessage(id: ID): Message | null {
  for (const list of Object.values(messagesByChannel)) {
    const found = list.find((message) => message.id === id);
    if (found) return found;
  }
  for (const list of Object.values(repliesByRootId)) {
    const found = list.find((message) => message.id === id);
    if (found) return found;
  }
  return null;
}

export const threadService = {
  async listFollowed(): Promise<Thread[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(threads);
    return request<Thread[]>("/threads");
  },

  async inbox(): Promise<ThreadInboxEntry[]> {
    if (!USE_MOCK_TRANSPORT) return request<ThreadInboxEntry[]>("/threads/inbox");

    const entries = threads
      .map((thread) => {
        const root = findMessage(thread.rootId);
        const channel = conversationsById[thread.channelId];
        if (!root || !channel) return null;
        return {
          thread,
          root,
          recentReplies: (repliesByRootId[thread.rootId] ?? []).slice(-2),
          channel,
        } satisfies ThreadInboxEntry;
      })
      .filter((entry): entry is ThreadInboxEntry => entry !== null)
      .sort((a, b) =>
        Date.parse(b.thread.lastReplyAt ?? "0") - Date.parse(a.thread.lastReplyAt ?? "0"),
      );

    return mockResolve(entries, 280);
  },

  async get(rootId: ID): Promise<Thread | null> {
    if (USE_MOCK_TRANSPORT) return mockResolve(threadsByRootId[rootId] ?? null, 80);
    return request<Thread>(`/threads/${rootId}`);
  },

  async getRoot(rootId: ID): Promise<Message | null> {
    if (USE_MOCK_TRANSPORT) return mockResolve(findMessage(rootId), 120);
    return request<Message>(`/messages/${rootId}`);
  },

  async listReplies(rootId: ID, cursor?: string | null): Promise<Paginated<Message>> {
    if (USE_MOCK_TRANSPORT) {
      const items = repliesByRootId[rootId] ?? [];
      return mockResolve({ items, nextCursor: null, hasMore: false }, 260);
    }
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return request<Paginated<Message>>(`/messages/${rootId}/replies${query}`);
  },

  async setFollowing(rootId: ID, isFollowing: boolean): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 100);
    return request<void>(`/threads/${rootId}/follow`, { method: "PUT", body: { isFollowing } });
  },

  async markRead(rootId: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 60);
    return request<void>(`/threads/${rootId}/read`, { method: "POST" });
  },
};
