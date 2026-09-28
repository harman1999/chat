import type { Workspace } from "@/types";
import { workspaces } from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export const workspaceService = {
  /** Workspaces the signed-in user belongs to. */
  async listMine(): Promise<Workspace[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(workspaces, 140);
    return request<Workspace[]>("/workspaces");
  },

  /** Creates a workspace and signs in to it as its owner. */
  async create(input: { name: string; password: string }): Promise<{ workspaceId: string; slug: string }> {
    if (USE_MOCK_TRANSPORT) return mockResolve({ workspaceId: "ws_mock", slug: "mock" }, 300);
    return request("/workspaces", { method: "POST", body: input });
  },

  /** Signs in to this email's account in another workspace, ending the current session. */
  async switchTo(workspaceId: string, password: string): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    return request<void>("/auth/switch", { method: "POST", body: { workspaceId, password } });
  },
};
