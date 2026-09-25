"use client";

import { useMemo } from "react";
import { useConversationMap, useCurrentUserId, useUsers } from "@/hooks";
import { isJumboEmoji, parseMessage, type InlineToken } from "@/lib/message-format";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store";

function Mention({ username }: { username: string }) {
  const { data: users } = useUsers();
  const currentUserId = useCurrentUserId();
  const user = users?.find((candidate) => candidate.username === username);
  const isSelf = Boolean(currentUserId) && user?.id === currentUserId;

  if (!user) return <span className="text-fg">@{username}</span>;

  return (
    <button
      type="button"
      className={cn(
        "rounded px-0.5 font-medium transition-colors",
        isSelf
          ? "bg-warning-subtle text-fg hover:bg-warning/25"
          : "bg-accent-subtle text-accent-subtle-fg hover:bg-accent/20",
      )}
    >
      @{user.displayName}
    </button>
  );
}

function ChannelRef({ name }: { name: string }) {
  const setActive = useWorkspaceStore((state) => state.setActiveConversation);
  const conversations = useConversationMap();
  const channel = Object.values(conversations).find(
    (item) => item.name === name && (item.kind === "public" || item.kind === "private"),
  );

  if (!channel) return <span>#{name}</span>;

  return (
    <button
      type="button"
      onClick={() => setActive(channel.id)}
      className="rounded px-0.5 font-medium text-accent transition-colors hover:bg-accent-subtle"
    >
      #{channel.name}
    </button>
  );
}

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.type) {
          case "text":
            return <span key={index}>{token.value}</span>;
          case "bold":
            return (
              <strong key={index} className="font-semibold text-fg">
                {token.value}
              </strong>
            );
          case "italic":
            return (
              <em key={index} className="italic">
                {token.value}
              </em>
            );
          case "strike":
            return (
              <s key={index} className="text-fg-muted">
                {token.value}
              </s>
            );
          case "code":
            return (
              <code
                key={index}
                className="rounded border border-border bg-surface-subtle px-1 py-px font-mono text-[0.8125em] text-danger"
              >
                {token.value}
              </code>
            );
          case "link":
            return (
              <a
                key={index}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                {token.label}
              </a>
            );
          case "mention":
            return <Mention key={index} username={token.username} />;
          case "channel":
            return <ChannelRef key={index} name={token.name} />;
          default:
            return null;
        }
      })}
    </>
  );
}

/**
 * Renders a message body from parsed tokens. No `dangerouslySetInnerHTML`
 * anywhere on this path — user content only ever becomes React text nodes.
 */
export function MessageBody({ body, className }: { body: string; className?: string }) {
  const blocks = useMemo(() => parseMessage(body), [body]);
  const jumbo = useMemo(() => isJumboEmoji(body), [body]);

  if (jumbo) {
    return (
      <p className={cn("text-3xl leading-tight", className)}>{body.trim()}</p>
    );
  }

  return (
    <div className={cn("space-y-1.5 text-base leading-relaxed text-fg", className)}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={index} className="whitespace-pre-wrap break-words">
                <Inline tokens={block.tokens} />
              </p>
            );
          case "bullet":
            return (
              <p key={index} className="flex gap-2 break-words pl-1">
                <span aria-hidden className="select-none text-fg-subtle">
                  •
                </span>
                <span className="min-w-0">
                  <Inline tokens={block.tokens} />
                </span>
              </p>
            );
          case "quote":
            return (
              <p
                key={index}
                className="border-l-2 border-border-strong pl-2.5 text-fg-muted break-words"
              >
                <Inline tokens={block.tokens} />
              </p>
            );
          case "codeblock":
            return (
              <pre
                key={index}
                className="scrollbar-thin overflow-x-auto rounded-md border border-border bg-surface-subtle p-2.5 font-mono text-xs leading-relaxed text-fg"
              >
                <code>{block.value}</code>
              </pre>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
