"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { messageService } from "@/services";
import { useMessageStore, useUIStore } from "@/store";
import { toPlainText } from "@/lib/message-format";
import { useCurrentUserId } from "./useDirectory";
import type { Message } from "@/types";

async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every message mutation in one place: patch the store first so the UI responds
 * immediately, then call the service. When the service becomes a real API, the
 * rollback branch is the only thing that needs filling in.
 */
export function useMessageActions(message: Message) {
  const patch = useMessageStore((state) => state.patch);
  const remove = useMessageStore((state) => state.remove);
  const removeReply = useMessageStore((state) => state.removeReply);
  const addReply = useMessageStore((state) => state.addReply);
  const upsert = useMessageStore((state) => state.upsert);
  const toggleReactionInStore = useMessageStore((state) => state.toggleReaction);
  const openThread = useUIStore((state) => state.openThread);
  const currentUserId = useCurrentUserId();

  const onReact = useCallback(
    (emoji: string, name: string) => {
      // No session yet means no identity to attribute the reaction to.
      if (!currentUserId) return;

      const hadReaction = message.reactions
        .find((item) => item.emoji === emoji)
        ?.userIds.includes(currentUserId);

      toggleReactionInStore(message.id, emoji, name, currentUserId);

      void (hadReaction
        ? messageService.removeReaction(message.id, emoji)
        : messageService.addReaction(message.id, emoji));
    },
    [currentUserId, message.id, message.reactions, toggleReactionInStore],
  );

  const onReply = useCallback(() => openThread(message.id), [message.id, openThread]);

  // Optimistic, but the toast waits for the outcome and the store is rolled
  // back on failure — a success message the server rejected is worse than a
  // slow one.
  const onToggleSave = useCallback(async () => {
    const isSaved = !message.isSaved;
    patch(message.id, { isSaved });
    try {
      await messageService.setSaved(message.id, isSaved);
      toast.success(isSaved ? "Saved for later" : "Removed from saved", {
        description: isSaved ? "Find it under Saved in the sidebar." : undefined,
      });
    } catch {
      patch(message.id, { isSaved: !isSaved });
      toast.error("Could not update saved messages");
    }
  }, [message.id, message.isSaved, patch]);

  const onTogglePin = useCallback(async () => {
    const isPinned = !message.isPinned;
    patch(message.id, { isPinned });
    try {
      await messageService.setPinned(message.id, isPinned);
      toast.success(isPinned ? "Pinned to channel" : "Unpinned from channel", {
        description: isPinned ? "Everyone in the channel can see pinned messages." : undefined,
      });
    } catch {
      patch(message.id, { isPinned: !isPinned });
      toast.error("Could not update the pin", {
        description: "You may not have permission in this channel.",
      });
    }
  }, [message.id, message.isPinned, patch]);

  const onCopyText = useCallback(async () => {
    const ok = await copyToClipboard(toPlainText(message.body));
    if (ok) toast.success("Message copied");
    else toast.error("Could not copy", { description: "Clipboard access was denied." });
  }, [message.body]);

  const onCopyLink = useCallback(async () => {
    const link = `${window.location.origin}/workspace?c=${message.channelId}&m=${message.id}`;
    const ok = await copyToClipboard(link);
    if (ok) toast.success("Link copied");
    else toast.error("Could not copy link", { description: "Clipboard access was denied." });
  }, [message.channelId, message.id]);

  const onDelete = useCallback(() => {
    const snapshot = message;
    const rootId = message.threadRootId;

    if (rootId) removeReply(rootId, message.id);
    else remove(message.id);
    void messageService.remove(message.id);

    toast("Message deleted", {
      description: "It has been removed for everyone.",
      action: {
        label: "Undo",
        onClick: () => {
          if (rootId) addReply(rootId, snapshot);
          else upsert(snapshot);
          toast.success("Message restored");
        },
      },
    });
  }, [addReply, message, remove, removeReply, upsert]);

  const onMarkUnread = useCallback(() => {
    toast.success("Marked unread", { description: "This conversation will show as unread." });
  }, []);

  const saveEdit = useCallback(
    (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || trimmed === message.body) return;
      patch(message.id, { body: trimmed, editedAt: new Date().toISOString() });
      void messageService.update(message.id, trimmed);
    },
    [message.body, message.id, patch],
  );

  return useMemo(
    () => ({
      onReact,
      onReply,
      onToggleSave: () => void onToggleSave(),
      onTogglePin: () => void onTogglePin(),
      onCopyText: () => void onCopyText(),
      onCopyLink: () => void onCopyLink(),
      onDelete,
      onMarkUnread,
      saveEdit,
    }),
    [onCopyLink, onCopyText, onDelete, onMarkUnread, onReact, onReply, onToggleSave, onTogglePin, saveEdit],
  );
}
