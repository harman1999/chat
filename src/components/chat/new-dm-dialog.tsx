"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCurrentUserId, useUsers } from "@/hooks";
import { channelService } from "@/services";
import { isApiError } from "@/services/http";
import { useWorkspaceStore } from "@/store";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

/**
 * Starts a direct message.
 *
 * Choosing someone opens the conversation immediately rather than asking for a
 * second confirmation — there is nothing to confirm, and an existing
 * conversation is simply reopened.
 */
export function NewDirectMessageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: directory } = useUsers();
  const currentUserId = useCurrentUserId();
  const setActiveConversation = useWorkspaceStore((state) => state.setActiveConversation);

  const [term, setTerm] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return (directory ?? [])
      .filter((user) => !user.isBot)
      .filter(
        (user) =>
          !needle ||
          user.displayName.toLowerCase().includes(needle) ||
          user.username.includes(needle) ||
          user.title.toLowerCase().includes(needle) ||
          // "me" and "you" find your own notes without remembering your name.
          (user.id === currentUserId && ["me", "you", "notes"].some((word) => word.startsWith(needle))),
      )
      // You first: a note-to-self is the one conversation everybody has.
      .sort((a, b) => Number(b.id === currentUserId) - Number(a.id === currentUserId))
      .slice(0, 50);
  }, [currentUserId, directory, term]);

  const openWith = async (user: User) => {
    setPendingId(user.id);
    try {
      const conversation = await channelService.openDirectMessage(user.id);

      // Seeded before switching, so the conversation view has its data the
      // moment it mounts rather than flashing a loading state for something
      // already in hand.
      queryClient.setQueryData(["conversation", conversation.id], conversation);
      // Prefix match: the list is keyed ["dms", workspaceId].
      await queryClient.invalidateQueries({ queryKey: ["dms"] });

      setActiveConversation(conversation.id);
      onOpenChange(false);
      setTerm("");
    } catch (error) {
      toast.error("Could not open the conversation", {
        description: isApiError(error) ? error.message : undefined,
      });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setTerm("");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New direct message</DialogTitle>
          <DialogDescription>
            Pick someone to talk to, or yourself for private notes. An existing conversation
            reopens rather than starting over.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
              aria-hidden
            />
            <Input
              autoFocus
              value={term}
              placeholder="Search by name, username or title"
              aria-label="Search people"
              onChange={(event) => setTerm(event.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <ul className="max-h-72 overflow-y-auto scrollbar-thin px-3 py-2" role="listbox">
          {matches.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-fg-subtle">
              {term ? `Nobody matches “${term}”.` : "No one else is in this workspace yet."}
            </li>
          )}
          {matches.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                disabled={pendingId !== null}
                onClick={() => void openWith(user)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                  "hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                <UserAvatar user={user} size="sm" showPresence ringClassName="border-surface-raised" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-fg">
                    {user.displayName}
                    {user.id === currentUserId && (
                      <span className="ml-1 font-normal text-fg-subtle">(you)</span>
                    )}
                  </span>
                  <span className="block truncate text-[0.625rem] text-fg-subtle">
                    {user.id === currentUserId
                      ? "Notes, drafts and reminders — only you can see them"
                      : user.title || `@${user.username}`}
                  </span>
                </span>
                {pendingId === user.id && (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-fg-subtle" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
