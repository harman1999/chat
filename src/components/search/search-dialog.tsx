"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, SearchX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/common";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useConversationMap, useJumpToMessage } from "@/hooks";
import { searchService } from "@/services";
import { cn } from "@/lib/utils";
import { useUIStore, useWorkspaceStore } from "@/store";
import type { SearchResult, SearchResultKind } from "@/types";
import { SearchResultItem } from "./search-result-item";

const FILTERS: { value: SearchResultKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "message", label: "Messages" },
  { value: "person", label: "People" },
  { value: "channel", label: "Channels" },
  { value: "file", label: "Files" },
];

const SUGGESTIONS = ["production deployment", "payment service", "rollback", "invoice export"];

/** Debounces the term so a fast typist triggers one query, not ten. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SearchDialog() {
  const isOpen = useUIStore((state) => state.isSearchOpen);
  const setOpen = useUIStore((state) => state.setSearchOpen);
  const setActiveConversation = useWorkspaceStore((state) => state.setActiveConversation);
  const jumpToMessage = useJumpToMessage();
  const conversations = useConversationMap();

  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<SearchResultKind | "all">("all");
  const [activeIndex, setActiveIndex] = useState(0);

  const debouncedTerm = useDebounced(term, 180);

  const { data: groups, isFetching } = useQuery({
    queryKey: ["search", debouncedTerm, filter],
    queryFn: () =>
      searchService.search({
        term: debouncedTerm,
        kinds: filter === "all" ? undefined : [filter],
      }),
    enabled: debouncedTerm.trim().length > 0,
    staleTime: 30_000,
  });

  /** Flat list backing arrow-key navigation across groups. */
  const flatResults: SearchResult[] = useMemo(
    () => (groups ?? []).flatMap((group) => group.results),
    [groups],
  );

  // Reset the cursor when the query changes. Derived during render rather than
  // in an effect, so there is no extra commit before the list repaints.
  const queryKey = `${debouncedTerm}|${filter}`;
  const [lastQueryKey, setLastQueryKey] = useState(queryKey);
  if (queryKey !== lastQueryKey) {
    setLastQueryKey(queryKey);
    setActiveIndex(0);
  }

  const reset = useCallback(() => {
    setTerm("");
    setFilter("all");
    setActiveIndex(0);
  }, []);

  const select = useCallback(
    (result: SearchResult) => {
      if (result.kind === "person") {
        // Open the existing DM with that person where one exists.
        const dm = Object.values(conversations).find(
          (conversation) =>
            (conversation.kind === "dm" || conversation.kind === "group_dm") &&
            conversation.participantIds?.includes(result.refId),
        );
        if (dm) {
          setActiveConversation(dm.id);
          setOpen(false);
          reset();
        }
        return;
      }

      if (result.kind === "channel") {
        setActiveConversation(result.refId);
        setOpen(false);
        reset();
        return;
      }

      if (result.channelId) {
        jumpToMessage(result.channelId, result.kind === "message" ? result.refId : null);
        reset();
      }
    },
    [conversations, jumpToMessage, reset, setActiveConversation, setOpen],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (flatResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % flatResults.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + flatResults.length) % flatResults.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      select(flatResults[activeIndex]);
    }
  };

  const hasTerm = debouncedTerm.trim().length > 0;
  const hasResults = flatResults.length > 0;
  let flatIndex = -1;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) reset();
      }}
    >
      <DialogContent
        showClose={false}
        className="top-[10vh] max-w-2xl translate-y-0 overflow-hidden p-0"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search messages, people, channels and files across the workspace.
        </DialogDescription>

        <div className="flex h-12 items-center gap-2.5 border-b border-border px-4">
          {isFetching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-fg-subtle" aria-hidden />
          ) : (
            <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          )}
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-expanded={hasResults}
            aria-controls="search-results"
            aria-label="Search messages, people and channels"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search messages, people and channels"
            className="h-full min-w-0 flex-1 bg-transparent text-md text-fg outline-none placeholder:text-fg-subtle"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                filter === option.value
                  ? "bg-accent-subtle text-accent-subtle-fg"
                  : "text-fg-muted hover:bg-surface-hover hover:text-fg",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div id="search-results" role="listbox" aria-label="Search results" className="max-h-[52vh] overflow-y-auto scrollbar-thin p-1.5">
          {!hasTerm ? (
            <div className="px-1.5 py-2">
              <p className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                Try searching for
              </p>
              <div className="flex flex-wrap gap-1.5 px-1">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setTerm(suggestion)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-fg"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : !hasResults && !isFetching ? (
            <EmptyState
              icon={SearchX}
              title={`No results for “${debouncedTerm}”`}
              description="Check the spelling, or try a broader term."
              compact
            />
          ) : (
            (groups ?? []).map((group) => (
              <section key={group.kind} className="mb-1.5 last:mb-0">
                <p className="flex items-baseline gap-2 px-2 py-1 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  {group.label}
                  <span className="font-normal normal-case tracking-normal">
                    {group.total > group.results.length
                      ? `${group.results.length} of ${group.total}`
                      : group.total}
                  </span>
                </p>
                {group.results.map((result) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  return (
                    <SearchResultItem
                      key={result.id}
                      result={result}
                      term={debouncedTerm}
                      isActive={index === activeIndex}
                      onSelect={() => select(result)}
                      onHover={() => setActiveIndex(index)}
                    />
                  );
                })}
              </section>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-2xs text-fg-subtle">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd>
            to open
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>Esc</Kbd>
            to close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
