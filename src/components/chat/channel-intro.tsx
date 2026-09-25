"use client";

import { Hash, Lock, UserPlus } from "lucide-react";
import { useUIStore } from "@/store";
import { UserAvatar } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useUserMap } from "@/hooks";
import type { Channel } from "@/types";

/** Header shown once the full history is loaded — the top of the conversation. */
export function ChannelIntro({ conversation }: { conversation: Channel }) {
  const usersById = useUserMap();
  const openAddPeople = useUIStore((state) => state.setAddPeopleOpen);
  const isChannel = conversation.kind === "public" || conversation.kind === "private";
  const Glyph = conversation.kind === "private" ? Lock : Hash;
  const creator = usersById[conversation.createdBy];
  const partner = conversation.participantIds?.[0] ? usersById[conversation.participantIds[0]] : null;

  const created = new Date(conversation.createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (!isChannel && partner) {
    return (
      <div className="flex flex-col items-start gap-3 px-3 pb-4 pt-8 sm:px-4">
        <UserAvatar user={partner} size="xl" showPresence />
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-fg">{partner.displayName}</h2>
          <p className="text-sm text-fg-muted">
            {partner.title} · {partner.department}
          </p>
        </div>
        <p className="max-w-xl text-sm leading-relaxed text-fg-muted">
          This is the beginning of your direct message history with{" "}
          <span className="font-medium text-fg">{partner.displayName}</span>. Messages here are
          visible only to the two of you.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2.5 px-3 pb-4 pt-8 sm:px-4">
      <span className="grid size-11 place-items-center rounded-lg border border-border bg-surface-subtle text-fg-muted">
        <Glyph className="size-5" aria-hidden />
      </span>
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-fg">
          {isChannel ? `#${conversation.name}` : conversation.name}
        </h2>
        <p className="text-xs text-fg-subtle">
          Created by {creator?.displayName ?? "a teammate"} on {created}
        </p>
      </div>
      <p className="max-w-xl text-balance text-sm leading-relaxed text-fg-muted">
        This is the very beginning of the{" "}
        <span className="font-medium text-fg">
          {isChannel ? `#${conversation.name}` : conversation.name}
        </span>{" "}
        channel. {conversation.description || conversation.purpose}
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-1"
        onClick={() => openAddPeople(true)}
      >
        <UserPlus />
        Add people
      </Button>
    </div>
  );
}
