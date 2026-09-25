"use client";

import { Hash, Lock, PencilLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDrafts } from "@/hooks";
import { useMessageStore, useUIStore, useWorkspaceStore } from "@/store";
import type { DraftEntry } from "@/hooks";

function DraftCard({ draft }: { draft: DraftEntry }) {
  const setActiveConversation = useWorkspaceStore((state) => state.setActiveConversation);
  const setNavSection = useWorkspaceStore((state) => state.setNavSection);
  const openThread = useUIStore((state) => state.openThread);
  const setDraft = useMessageStore((state) => state.setDraft);

  const conversation = draft.conversation;
  const isChannel = conversation?.kind === "public" || conversation?.kind === "private";
  const Glyph = conversation?.kind === "private" ? Lock : Hash;

  return (
    <article className="rounded-lg border border-border bg-surface transition-colors hover:border-border-strong">
      <header className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-fg">
          {isChannel && <Glyph className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />}
          <span className="truncate">{conversation?.name ?? "Unknown conversation"}</span>
        </span>
        {draft.threadRootId && (
          <span className="shrink-0 rounded bg-surface-active px-1.5 py-px text-[0.625rem] font-semibold uppercase tracking-wide text-fg-subtle">
            Thread
          </span>
        )}
      </header>

      <p className="whitespace-pre-wrap break-words px-3 py-2.5 text-base leading-relaxed text-fg">
        {draft.body}
      </p>

      <footer className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={!conversation}
          onClick={() => {
            if (!conversation) return;
            setNavSection("home");
            setActiveConversation(conversation.id);
            if (draft.threadRootId) openThread(draft.threadRootId);
          }}
        >
          <PencilLine />
          Continue writing
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-danger hover:bg-danger-subtle"
          onClick={() => {
            setDraft(draft.key, "");
            toast.success("Draft discarded");
          }}
        >
          <Trash2 />
          Discard
        </Button>
      </footer>
    </article>
  );
}

export function DraftsView() {
  const drafts = useDrafts();

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-md font-semibold tracking-tight text-fg">Drafts</h1>
          <p className="truncate text-2xs text-fg-subtle">
            {drafts.length > 0
              ? `${drafts.length} unsent ${drafts.length === 1 ? "message" : "messages"}`
              : "Messages you started but haven't sent"}
          </p>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        {drafts.length === 0 ? (
          <EmptyState
            icon={PencilLine}
            title="No drafts"
            description="Anything you type and leave unsent is kept here, per conversation and per thread."
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
            {drafts.map((draft) => (
              <DraftCard key={draft.key} draft={draft} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
