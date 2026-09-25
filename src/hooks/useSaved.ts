"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { messageService } from "@/services";
import { useMessageStore } from "@/store";
import type { Message } from "@/types";

/**
 * Saved messages.
 *
 * Merged with the local store so saving from the hover toolbar shows up here
 * immediately, and unsaving removes it, without waiting for a refetch.
 */
export function useSaved() {
  const query = useQuery<Message[]>({
    queryKey: ["saved"],
    queryFn: () => messageService.listSaved(),
    staleTime: 30_000,
  });

  const byId = useMessageStore((state) => state.byId);

  const messages = useMemo(() => {
    const merged = new Map<string, Message>();
    for (const message of query.data ?? []) merged.set(message.id, byId[message.id] ?? message);
    for (const message of Object.values(byId)) if (message.isSaved) merged.set(message.id, message);

    return [...merged.values()]
      .filter((message) => message.isSaved)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [byId, query.data]);

  return { ...query, messages };
}
