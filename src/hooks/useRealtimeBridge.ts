"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { realtimeClient } from "@/services";
import { useMessageStore } from "@/store";
import type { ID, Message, Reaction } from "@/types";

interface ReactionPayload {
  messageId: ID;
  emoji: string;
  name: string;
  userId: ID;
}

interface TypingPayload {
  channelId: ID;
  userId: ID;
}

/**
 * Applies inbound socket events to the message store.
 *
 * Mounted once by the app shell. The handlers are the real ones — they run
 * today against `realtimeClient.simulate(...)` and will run unchanged against
 * the server once `NEXT_PUBLIC_WS_URL` is set.
 */
export function useRealtimeBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const store = useMessageStore.getState;

    const unsubscribes = [
      realtimeClient.on<Message>("message.created", ({ payload }) => {
        if (payload.threadRootId) store().addReply(payload.threadRootId, payload);
        else store().upsert(payload);
        store().setTyping(payload.channelId, payload.authorId, false);
      }),

      realtimeClient.on<Message>("message.updated", ({ payload }) => {
        store().patch(payload.id, payload);
      }),

      realtimeClient.on<{ id: ID; threadRootId?: ID | null }>("message.deleted", ({ payload }) => {
        if (payload.threadRootId) store().removeReply(payload.threadRootId, payload.id);
        else store().remove(payload.id);
      }),

      realtimeClient.on<ReactionPayload>("reaction.created", ({ payload }) => {
        const message = store().byId[payload.messageId];
        const already = message?.reactions
          .find((item: Reaction) => item.emoji === payload.emoji)
          ?.userIds.includes(payload.userId);
        // toggleReaction is idempotent only when the current state differs.
        if (!already) {
          store().toggleReaction(payload.messageId, payload.emoji, payload.name, payload.userId);
        }
      }),

      realtimeClient.on<ReactionPayload>("reaction.deleted", ({ payload }) => {
        const message = store().byId[payload.messageId];
        const present = message?.reactions
          .find((item: Reaction) => item.emoji === payload.emoji)
          ?.userIds.includes(payload.userId);
        if (present) {
          store().toggleReaction(payload.messageId, payload.emoji, payload.name, payload.userId);
        }
      }),

      realtimeClient.on<TypingPayload>("typing.started", ({ payload }) => {
        store().setTyping(payload.channelId, payload.userId, true);
      }),

      realtimeClient.on<TypingPayload>("typing.stopped", ({ payload }) => {
        store().setTyping(payload.channelId, payload.userId, false);
      }),

      // Joining, leaving or archiving changes which conversations exist for
      // this viewer, so the sidebar lists have to be refetched.
      realtimeClient.on("channel.membership", () => {
        void queryClient.invalidateQueries({ queryKey: ["channels"] });
        void queryClient.invalidateQueries({ queryKey: ["dms"] });
      }),
    ];

    realtimeClient.connect();

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [queryClient]);
}
