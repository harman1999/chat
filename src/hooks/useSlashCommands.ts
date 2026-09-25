import { useQuery } from "@tanstack/react-query";
import { commandService } from "@/services";
import type { SlashCommand } from "@/types";

/**
 * The slash commands the composer can offer.
 *
 * Registered commands change rarely, so this is cached for the session rather
 * than refetched per channel — the composer mounts on every conversation
 * switch and a request each time would be wasted.
 */
export function useSlashCommands(): SlashCommand[] {
  const { data } = useQuery({
    queryKey: ["slash-commands"],
    queryFn: () => commandService.list(),
    staleTime: 5 * 60 * 1000,
    // A workspace with no commands is the normal case, not an error worth
    // retrying or surfacing.
    retry: false,
  });
  return data ?? [];
}
