"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Hash, Lock, Pin, Paperclip, UserPlus, Users } from "lucide-react";
import * as React from "react";
import { EmptyState, UserAvatar } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { channelService } from "@/services";
import { PRESENCE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { MessagePreview } from "@/components/messages/message-preview";
import { useMessageStore, useUIStore, useWorkspaceStore } from "@/store";
import { useConversation } from "@/hooks";
import { PanelHeader } from "./panel-header";

function Section({
  title,
  action,
  defaultOpen = true,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  // `null` until the user touches it, so a section can still open itself once
  // its data arrives (pinned messages load after the first render).
  const [override, setOverride] = React.useState<boolean | null>(null);
  const isOpen = override ?? defaultOpen;
  const id = React.useId();

  return (
    <section className="border-b border-border last:border-b-0">
      <div className="flex h-9 items-center gap-1 px-3">
        <button
          type="button"
          onClick={() => setOverride(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={id}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle transition-colors hover:text-fg"
        >
          <ChevronDown
            className={cn("size-3 transition-transform duration-150", !isOpen && "-rotate-90")}
            aria-hidden
          />
          <span className="truncate">{title}</span>
        </button>
        {action}
      </div>
      <div id={id} hidden={!isOpen} className="px-3 pb-3">
        {children}
      </div>
    </section>
  );
}

export function ChannelDetailsPanel({ onClose }: { onClose?: () => void }) {
  const conversationId = useWorkspaceStore((state) => state.activeConversationId);
  const openRightPanel = useUIStore((state) => state.openRightPanel);
  const setAddPeopleOpen = useUIStore((state) => state.setAddPeopleOpen);
  const { data: conversation, isPending: isConversationPending } = useConversation(conversationId);
  const messagesById = useMessageStore((state) => state.byId);
  const channelMessageIds = useMessageStore((state) => state.idsByChannel[conversationId]);
  const pinned = (channelMessageIds ?? [])
    .map((id) => messagesById[id])
    .filter((message) => message?.isPinned);

  const membersQuery = useQuery({
    queryKey: ["channel-members", conversationId],
    queryFn: () => channelService.members(conversationId),
  });

  if (isConversationPending) {
    return (
      <div className="flex h-full flex-col bg-surface">
        <div className="flex h-12 shrink-0 items-center border-b border-border px-3">
          <Skeleton className="h-3 w-28 rounded-full" />
        </div>
        <div className="space-y-2 p-3">
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton className="h-2.5 w-4/5 rounded-full" />
        </div>
      </div>
    );
  }

  if (!conversation) {
    return <EmptyState icon={Hash} title="No conversation selected" compact />;
  }

  const isChannel = conversation.kind === "public" || conversation.kind === "private";
  const Glyph = conversation.kind === "private" ? Lock : Hash;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <PanelHeader
        title={
          <span className="flex items-center gap-1">
            {isChannel && <Glyph className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />}
            <span className="truncate">{conversation.name}</span>
          </span>
        }
        subtitle={`${conversation.memberCount.toLocaleString()} members`}
        onClose={onClose}
      />

      <ScrollArea className="min-h-0 flex-1">
        {conversation.description && (
          <Section title="About">
            <p className="text-sm leading-relaxed text-fg-muted">{conversation.description}</p>
            {conversation.topic && (
              <p className="mt-2.5 rounded-md border border-border bg-surface-subtle px-2.5 py-2 text-xs leading-relaxed text-fg-muted">
                <span className="font-semibold text-fg">Topic · </span>
                {conversation.topic}
              </p>
            )}
          </Section>
        )}

        <Section
          title="Pinned"
          action={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="View all pinned messages"
              onClick={() => openRightPanel("pinned")}
            >
              <Pin />
            </Button>
          }
          defaultOpen={pinned.length > 0}
        >
          {pinned.length === 0 ? (
            <EmptyState
              icon={Pin}
              title="No pinned messages"
              description="Pin important messages so the team can find them here."
              compact
            />
          ) : (
            <div className="space-y-1.5">
              {pinned.slice(0, 3).map((message) => (
                <MessagePreview key={message.id} message={message} />
              ))}
              {pinned.length > 3 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start px-1.5"
                  onClick={() => openRightPanel("pinned")}
                >
                  <Pin />
                  View all {pinned.length} pinned messages
                </Button>
              )}
            </div>
          )}
        </Section>

        <Section
          title={`Members · ${conversation.memberCount.toLocaleString()}`}
          action={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add people to this channel"
              onClick={() => setAddPeopleOpen(true)}
            >
              <UserPlus />
            </Button>
          }
        >
          {membersQuery.isPending ? (
            <div className="space-y-2 py-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Skeleton className="size-6 rounded-[5px]" />
                  <Skeleton className="h-2.5 w-28 rounded-full" />
                </div>
              ))}
            </div>
          ) : membersQuery.data?.length ? (
            <ul className="-mx-1.5 space-y-px">
              {membersQuery.data.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-hover"
                  >
                    <UserAvatar user={member} size="sm" showPresence />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-fg">
                        {member.displayName}
                        {member.isBot && (
                          <span className="ml-1.5 rounded bg-surface-active px-1 py-px text-[0.5625rem] font-semibold uppercase tracking-wide text-fg-subtle">
                            app
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[0.625rem] text-fg-subtle">
                        {member.customStatus
                          ? `${member.customStatus.emoji} ${member.customStatus.text}`
                          : member.title}
                      </span>
                    </span>
                    <span className="sr-only">{PRESENCE_LABEL[member.presence]}</span>
                  </button>
                </li>
              ))}
              {conversation.memberCount > (membersQuery.data?.length ?? 0) && (
                <li className="pt-1.5">
                  <Button variant="ghost" size="sm" className="w-full justify-start px-1.5">
                    <Users />
                    View all {conversation.memberCount.toLocaleString()} members
                  </Button>
                </li>
              )}
            </ul>
          ) : (
            <EmptyState icon={Users} title="No members yet" compact />
          )}
        </Section>

        <Section title="Files" defaultOpen={false}>
          <EmptyState
            icon={Paperclip}
            title="No files shared"
            description="Files shared in this conversation will appear here."
            compact
          />
        </Section>
      </ScrollArea>
    </div>
  );
}
