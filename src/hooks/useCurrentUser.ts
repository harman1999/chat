"use client";

import { useQuery } from "@tanstack/react-query";
import { authService } from "@/services";
import type { User } from "@/types";

/** The signed-in user. Reads `authService.me()` so session wiring drops in cleanly. */
export function useCurrentUser() {
  return useQuery<User>({
    queryKey: ["current-user"],
    queryFn: () => authService.me(),
    staleTime: Infinity,
  });
}
