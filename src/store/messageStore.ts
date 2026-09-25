"use client";

import { create } from "zustand";
import type { Attachment, ID, Message, Reaction } from "@/types";

/**
 * Normalised message cache.
 *
 * Zustand rather than the query cache because messages are long-lived, mutable
 * and patched from three directions at once — the user, optimistic sends and
 * inbound realtime events. TanStack Query still owns the *fetch*; it hands
 * pages to `ingest` and components read from here.
 */
interface MessageState {
  byId: Record<ID, Message>;
  /** Ascending chronological order, per channel. */
  idsByChannel: Record<ID, ID[]>;
  cursorByChannel: Record<ID, string | null>;
  hasMoreByChannel: Record<ID, boolean>;
  draftByChannel: Record<ID, string>;
  /** Transient per-channel typing presence, keyed by user id. */
  typingByChannel: Record<ID, ID[]>;

  /** Reply ids per thread root, ascending. Roots stay in `idsByChannel`. */
  idsByThread: Record<ID, ID[]>;
  threadMetaByRootId: Record<ID, { isFollowing: boolean; unreadReplyCount: number }>;

  ingest: (channelId: ID, items: Message[], options?: { position?: "head" | "tail" }) => void;
  setPage: (channelId: ID, cursor: string | null, hasMore: boolean) => void;
  upsert: (message: Message) => void;
  /** Swaps a `pending_…` message for the server's copy, which has a real id. */
  replaceOptimistic: (pendingId: ID, message: Message) => void;
  patch: (id: ID, changes: Partial<Message>) => void;
  remove: (id: ID) => void;
  toggleReaction: (id: ID, emoji: string, name: string, userId: ID) => void;
  setDraft: (channelId: ID, value: string) => void;
  setTyping: (channelId: ID, userId: ID, isTyping: boolean) => void;

  ingestThread: (rootId: ID, replies: Message[]) => void;
  addReply: (rootId: ID, reply: Message) => void;
  removeReply: (rootId: ID, replyId: ID) => void;
  setThreadMeta: (rootId: ID, meta: { isFollowing: boolean; unreadReplyCount: number }) => void;
  /** Seeds meta for threads not yet tracked, without clobbering read state. */
  seedThreadMeta: (
    entries: { rootId: ID; isFollowing: boolean; unreadReplyCount: number }[],
  ) => void;
  setThreadFollowing: (rootId: ID, isFollowing: boolean) => void;
  markThreadRead: (rootId: ID) => void;
}

function sortIds(byId: Record<ID, Message>, ids: ID[]): ID[] {
  return [...new Set(ids)].sort((a, b) => {
    const left = byId[a];
    const right = byId[b];
    if (!left || !right) return 0;
    const delta = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return delta !== 0 ? delta : left.id.localeCompare(right.id);
  });
}

export const useMessageStore = create<MessageState>()((set) => ({
  byId: {},
  idsByChannel: {},
  cursorByChannel: {},
  hasMoreByChannel: {},
  draftByChannel: {},
  typingByChannel: {},
  idsByThread: {},
  threadMetaByRootId: {},

  ingest: (channelId, items, options) =>
    set((state) => {
      if (items.length === 0) return state;
      const byId = { ...state.byId };
      for (const message of items) {
        // Never let a refetch clobber local edits that have not round-tripped.
        byId[message.id] = { ...byId[message.id], ...message };
      }
      const existing = state.idsByChannel[channelId] ?? [];
      const incoming = items.map((message) => message.id);
      const merged =
        options?.position === "head" ? [...incoming, ...existing] : [...existing, ...incoming];

      return {
        byId,
        idsByChannel: { ...state.idsByChannel, [channelId]: sortIds(byId, merged) },
      };
    }),

  setPage: (channelId, cursor, hasMore) =>
    set((state) => ({
      cursorByChannel: { ...state.cursorByChannel, [channelId]: cursor },
      hasMoreByChannel: { ...state.hasMoreByChannel, [channelId]: hasMore },
    })),

  upsert: (message) =>
    set((state) => {
      const byId = { ...state.byId, [message.id]: message };
      const existing = state.idsByChannel[message.channelId] ?? [];
      return {
        byId,
        idsByChannel: {
          ...state.idsByChannel,
          [message.channelId]: sortIds(byId, [...existing, message.id]),
        },
      };
    }),

  replaceOptimistic: (pendingId, message) =>
    set((state) => {
      const byId = { ...state.byId };
      delete byId[pendingId];
      byId[message.id] = message;

      const swap = (ids: ID[] | undefined) =>
        ids ? sortIds(byId, [...ids.filter((id) => id !== pendingId), message.id]) : ids;

      return {
        byId,
        idsByChannel: {
          ...state.idsByChannel,
          [message.channelId]: swap(state.idsByChannel[message.channelId]) ?? [message.id],
        },
        idsByThread: message.threadRootId
          ? {
              ...state.idsByThread,
              [message.threadRootId]: swap(state.idsByThread[message.threadRootId]) ?? [message.id],
            }
          : state.idsByThread,
      };
    }),

  patch: (id, changes) =>
    set((state) => {
      const current = state.byId[id];
      if (!current) return state;
      return { byId: { ...state.byId, [id]: { ...current, ...changes } } };
    }),

  remove: (id) =>
    set((state) => {
      const current = state.byId[id];
      if (!current) return state;
      const byId = { ...state.byId };
      delete byId[id];
      return {
        byId,
        idsByChannel: {
          ...state.idsByChannel,
          [current.channelId]: (state.idsByChannel[current.channelId] ?? []).filter(
            (messageId) => messageId !== id,
          ),
        },
      };
    }),

  toggleReaction: (id, emoji, name, userId) =>
    set((state) => {
      const message = state.byId[id];
      if (!message) return state;

      const existing = message.reactions.find((item) => item.emoji === emoji);
      let reactions: Reaction[];

      if (!existing) {
        reactions = [...message.reactions, { emoji, name, userIds: [userId], count: 1 }];
      } else if (existing.userIds.includes(userId)) {
        const userIds = existing.userIds.filter((item) => item !== userId);
        reactions =
          userIds.length === 0
            ? message.reactions.filter((item) => item.emoji !== emoji)
            : message.reactions.map((item) =>
                item.emoji === emoji ? { ...item, userIds, count: userIds.length } : item,
              );
      } else {
        const userIds = [...existing.userIds, userId];
        reactions = message.reactions.map((item) =>
          item.emoji === emoji ? { ...item, userIds, count: userIds.length } : item,
        );
      }

      return { byId: { ...state.byId, [id]: { ...message, reactions } } };
    }),

  setDraft: (channelId, value) =>
    set((state) => ({ draftByChannel: { ...state.draftByChannel, [channelId]: value } })),

  ingestThread: (rootId, replies) =>
    set((state) => {
      if (replies.length === 0) return state;
      const byId = { ...state.byId };
      for (const reply of replies) {
        byId[reply.id] = { ...byId[reply.id], ...reply };
      }
      const merged = [...(state.idsByThread[rootId] ?? []), ...replies.map((r) => r.id)];
      return {
        byId,
        idsByThread: { ...state.idsByThread, [rootId]: sortIds(byId, merged) },
      };
    }),

  addReply: (rootId, reply) =>
    set((state) => {
      const byId = { ...state.byId, [reply.id]: reply };
      const root = byId[rootId];

      // Keep the root's summary in step so the channel view updates too.
      if (root) {
        const participants = root.replyParticipantIds.includes(reply.authorId)
          ? root.replyParticipantIds
          : [...root.replyParticipantIds, reply.authorId];
        byId[rootId] = {
          ...root,
          replyCount: root.replyCount + 1,
          replyParticipantIds: participants,
          lastReplyAt: reply.createdAt,
        };
      }

      const merged = [...(state.idsByThread[rootId] ?? []), reply.id];
      return {
        byId,
        idsByThread: { ...state.idsByThread, [rootId]: sortIds(byId, merged) },
      };
    }),

  removeReply: (rootId, replyId) =>
    set((state) => {
      const byId = { ...state.byId };
      delete byId[replyId];
      const root = byId[rootId];
      if (root) byId[rootId] = { ...root, replyCount: Math.max(0, root.replyCount - 1) };
      return {
        byId,
        idsByThread: {
          ...state.idsByThread,
          [rootId]: (state.idsByThread[rootId] ?? []).filter((id) => id !== replyId),
        },
      };
    }),

  setThreadMeta: (rootId, meta) =>
    set((state) => ({ threadMetaByRootId: { ...state.threadMetaByRootId, [rootId]: meta } })),

  seedThreadMeta: (entries) =>
    set((state) => {
      const next = { ...state.threadMetaByRootId };
      let changed = false;
      for (const entry of entries) {
        if (next[entry.rootId]) continue;
        next[entry.rootId] = {
          isFollowing: entry.isFollowing,
          unreadReplyCount: entry.unreadReplyCount,
        };
        changed = true;
      }
      return changed ? { threadMetaByRootId: next } : state;
    }),

  setThreadFollowing: (rootId, isFollowing) =>
    set((state) => {
      const current = state.threadMetaByRootId[rootId] ?? { isFollowing: false, unreadReplyCount: 0 };
      return {
        threadMetaByRootId: {
          ...state.threadMetaByRootId,
          [rootId]: { ...current, isFollowing },
        },
      };
    }),

  markThreadRead: (rootId) =>
    set((state) => {
      const current = state.threadMetaByRootId[rootId];
      if (!current || current.unreadReplyCount === 0) return state;
      return {
        threadMetaByRootId: {
          ...state.threadMetaByRootId,
          [rootId]: { ...current, unreadReplyCount: 0 },
        },
      };
    }),

  setTyping: (channelId, userId, isTyping) =>
    set((state) => {
      const current = state.typingByChannel[channelId] ?? [];
      const next = isTyping
        ? current.includes(userId)
          ? current
          : [...current, userId]
        : current.filter((item) => item !== userId);
      if (next === current) return state;
      return { typingByChannel: { ...state.typingByChannel, [channelId]: next } };
    }),
}));

/** Builds a client-side message for optimistic rendering before the server replies. */
export function createOptimisticMessage(input: {
  channelId: ID;
  authorId: ID;
  body: string;
  threadRootId?: ID | null;
  attachments?: Attachment[];
  mentionedUserIds?: ID[];
}): Message {
  return {
    id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    channelId: input.channelId,
    authorId: input.authorId,
    kind: "text",
    body: input.body,
    createdAt: new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
    reactions: [],
    attachments: input.attachments ?? [],
    mentionedUserIds: input.mentionedUserIds ?? [],
    threadRootId: input.threadRootId ?? null,
    replyCount: 0,
    replyParticipantIds: [],
    lastReplyAt: null,
    isPinned: false,
    isSaved: false,
    deliveryState: "pending",
  };
}
