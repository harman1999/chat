"use client";

import { useQuery } from "@tanstack/react-query";
import { messageService } from "@/services";
import type { Message } from "@/types";

/** Messages that mention the signed-in user, newest first. */
export function useMentions() {
  return useQuery<Message[]>({
    queryKey: ["mentions"],
    queryFn: () => messageService.listMentions(),
    staleTime: 60_000,
  });
}
