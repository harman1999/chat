"use client";

import {
  FileText,
  Hash,
  ImageIcon,
  Lock,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import { UserAvatar } from "@/components/common";
import { useConversationMap, useUserMap } from "@/hooks";
import { useTimeFormatter } from "@/hooks";
import { formatDayDivider } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/types";

/** Bolds the matched term inside a snippet without rendering any HTML. */
function Highlighted({ text, term }: { text: string; term: string }) {
  const needle = term.trim();
  if (!needle) return <>{text}</>;

  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={index} className="rounded-sm bg-warning-subtle px-0.5 text-fg">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function LeadingVisual({ result }: { result: SearchResult }) {
  const usersById = useUserMap();
  const conversations = useConversationMap();

  if (result.kind === "person") {
    const user = usersById[result.refId];
    return user ? (
      <UserAvatar user={user} size="md" showPresence ringClassName="border-surface-raised" />
    ) : null;
  }

  if (result.kind === "message") {
    const author = result.authorId ? usersById[result.authorId] : null;
    return author ? <UserAvatar user={author} size="md" /> : null;
  }

  let Icon: LucideIcon = MessageSquareText;
  if (result.kind === "channel") {
    Icon = conversations[result.refId]?.kind === "private" ? Lock : Hash;
  }
  if (result.kind === "file") {
    Icon = /\.(png|jpe?g|gif|webp|svg)$/i.test(result.title) ? ImageIcon : FileText;
  }

  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface-subtle text-fg-subtle">
      <Icon className="size-4" aria-hidden />
    </span>
  );
}

export function SearchResultItem({
  result,
  term,
  isActive,
  onSelect,
  onHover,
}: {
  result: SearchResult;
  term: string;
  isActive: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const formatTime = useTimeFormatter();

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
        isActive ? "bg-surface-hover" : "hover:bg-surface-hover",
      )}
    >
      <span className="pt-0.5">
        <LeadingVisual result={result} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-semibold text-fg">{result.title}</span>
          {result.contextLabel && (
            <span className="truncate text-2xs text-fg-subtle">{result.contextLabel}</span>
          )}
          {result.timestamp && (
            <time dateTime={result.timestamp} className="ml-auto shrink-0 text-2xs tabular-nums text-fg-subtle">
              {formatDayDivider(result.timestamp)} · {formatTime(result.timestamp)}
            </time>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs leading-relaxed text-fg-muted">
          <Highlighted text={result.snippet} term={term} />
        </span>
      </span>
    </button>
  );
}
