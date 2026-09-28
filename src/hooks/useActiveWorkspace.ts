"use client";

import { useQuery } from "@tanstack/react-query";
import { workspaceService } from "@/services";
import { useWorkspaceStore } from "@/store";
import type { Workspace } from "@/types";

/**
 * The workspace being viewed, from the same cached query as the switcher, so a
 * rename or new logo shows everywhere at once. Undefined while loading.
 */
export function useActiveWorkspace(): Workspace | undefined {
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const { data } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => workspaceService.listMine(),
    staleTime: 5 * 60_000,
  });
  return data?.find((workspace) => workspace.isCurrent) ?? data?.find((workspace) => workspace.id === workspaceId);
}
