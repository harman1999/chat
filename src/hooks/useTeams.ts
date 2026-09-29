"use client";

import { useQuery } from "@tanstack/react-query";
import { teamService } from "@/services";

/** Every team in the workspace, marking the ones the signed-in person is in. */
export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: () => teamService.list(),
    staleTime: 30_000,
  });
}
