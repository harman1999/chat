"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightPanelView = "details" | "members" | "pinned" | "thread" | "files";

interface UIState {
  /** Desktop: rail vs full sidebar. Persisted across sessions. */
  isSidebarCollapsed: boolean;
  /** Mobile/tablet drawer for the workspace sidebar. */
  isSidebarDrawerOpen: boolean;
  isRightPanelOpen: boolean;
  /** Slide-over used below the xl breakpoint; never persisted. */
  isDetailsSheetOpen: boolean;
  rightPanelView: RightPanelView;
  isSearchOpen: boolean;
  isShortcutsOpen: boolean;
  /** Both dialogs are opened from several places, so the flag lives here. */
  isCreateChannelOpen: boolean;
  isAddPeopleOpen: boolean;
  activeThreadRootId: string | null;
  /** Message to scroll to and flash after a jump. Cleared once shown. */
  highlightedMessageId: string | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarDrawerOpen: (open: boolean) => void;
  toggleRightPanel: () => void;
  setRightPanelOpen: (open: boolean) => void;
  setDetailsSheetOpen: (open: boolean) => void;
  openRightPanel: (view: RightPanelView) => void;
  closeRightPanel: () => void;
  setSearchOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setCreateChannelOpen: (open: boolean) => void;
  setAddPeopleOpen: (open: boolean) => void;
  openThread: (rootId: string) => void;
  closeThread: () => void;
  setHighlightedMessage: (messageId: string | null) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      isSidebarDrawerOpen: false,
      isRightPanelOpen: true,
      isDetailsSheetOpen: false,
      rightPanelView: "details",
      isSearchOpen: false,
      isShortcutsOpen: false,
      isCreateChannelOpen: false,
      isAddPeopleOpen: false,
      activeThreadRootId: null,
      highlightedMessageId: null,

      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),
      setSidebarCollapsed: (isSidebarCollapsed) => set({ isSidebarCollapsed }),
      setSidebarDrawerOpen: (isSidebarDrawerOpen) => set({ isSidebarDrawerOpen }),
      toggleRightPanel: () => set((state) => ({ isRightPanelOpen: !state.isRightPanelOpen })),
      setRightPanelOpen: (isRightPanelOpen) => set({ isRightPanelOpen }),
      setDetailsSheetOpen: (isDetailsSheetOpen) => set({ isDetailsSheetOpen }),
      // Opens whichever surface the current breakpoint uses; the shell mounts
      // only one of them, so setting both is safe and keeps callers simple.
      openRightPanel: (rightPanelView) =>
        set({ rightPanelView, isRightPanelOpen: true, isDetailsSheetOpen: true }),
      closeRightPanel: () => set({ isRightPanelOpen: false, isDetailsSheetOpen: false }),
      setSearchOpen: (isSearchOpen) => set({ isSearchOpen }),
      setShortcutsOpen: (isShortcutsOpen) => set({ isShortcutsOpen }),
      setCreateChannelOpen: (isCreateChannelOpen) => set({ isCreateChannelOpen }),
      setAddPeopleOpen: (isAddPeopleOpen) => set({ isAddPeopleOpen }),
      openThread: (rootId) =>
        set({
          activeThreadRootId: rootId,
          rightPanelView: "thread",
          isRightPanelOpen: true,
          isDetailsSheetOpen: true,
        }),
      closeThread: () => set({ activeThreadRootId: null, rightPanelView: "details" }),
      setHighlightedMessage: (highlightedMessageId) => set({ highlightedMessageId }),
    }),
    {
      name: "helix.ui",
      // Ephemeral state (drawers, dialogs) must not survive a reload.
      partialize: (state) => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        isRightPanelOpen: state.isRightPanelOpen,
        // A thread view is meaningless without its root id, which is
        // deliberately ephemeral — persist the details view instead.
        rightPanelView: state.rightPanelView === "thread" ? "details" : state.rightPanelView,
      }),
    },
  ),
);
