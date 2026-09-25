"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NavSection = "home" | "threads" | "mentions" | "saved" | "drafts";

interface WorkspaceState {
  /** Empty until the session resolves; hydrated by `WorkspaceBootstrap`. */
  workspaceId: string;
  /** Empty until the channel list loads and the first channel is selected. */
  activeConversationId: string;
  activeNavSection: NavSection;
  /** Sidebar group collapse state, keyed by group id. */
  collapsedGroups: Record<string, boolean>;

  setWorkspace: (workspaceId: string) => void;
  /** `keepSection` leaves the sidebar section alone — used by the Threads view. */
  setActiveConversation: (conversationId: string, options?: { keepSection?: boolean }) => void;
  setNavSection: (section: NavSection) => void;
  toggleGroup: (groupId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      workspaceId: "",
      activeConversationId: "",
      activeNavSection: "home",
      collapsedGroups: {},

      setWorkspace: (workspaceId) => set({ workspaceId }),
      setActiveConversation: (activeConversationId, options) =>
        set(options?.keepSection ? { activeConversationId } : { activeConversationId, activeNavSection: "home" }),
      setNavSection: (activeNavSection) => set({ activeNavSection }),
      toggleGroup: (groupId) =>
        set((state) => ({
          collapsedGroups: { ...state.collapsedGroups, [groupId]: !state.collapsedGroups[groupId] },
        })),
    }),
    { name: "helix.workspace" },
  ),
);
