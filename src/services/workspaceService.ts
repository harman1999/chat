import type { Workspace } from "@/types";
import { workspaces } from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export const workspaceService = {
  /** Workspaces the signed-in user belongs to. */
  async listMine(): Promise<Workspace[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(workspaces, 140);
    return request<Workspace[]>("/workspaces");
  },
};
