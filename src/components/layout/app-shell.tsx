"use client";

import * as React from "react";
import { ChannelDialogs } from "@/components/chat/channel-dialogs";
import { SearchDialog } from "@/components/search";
import { WorkspaceBootstrap } from "@/components/workspace/workspace-bootstrap";
import { WorkspaceSidebar } from "@/components/sidebar";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useHotkeys, useMediaQuery, useRealtimeBridge } from "@/hooks";
import { cn } from "@/lib/utils";
import { useUIStore, useWorkspaceStore } from "@/store";
import { RightPanel } from "./right-panel";
import { MobileTabBar } from "./mobile-tab-bar";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { TopBar } from "./top-bar";

/**
 * Three-column application shell.
 *
 * - ≥1024px  sidebar is inline and collapsible to a 64px rail
 * - <1024px  sidebar moves into a left drawer
 * - ≥1280px  details panel is inline
 * - <1280px  details panel becomes a right slide-over
 *
 * Only this component knows about breakpoints; every panel below it is
 * viewport-agnostic and simply renders into the slot it is given.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const isDrawerOpen = useUIStore((state) => state.isSidebarDrawerOpen);
  const setDrawerOpen = useUIStore((state) => state.setSidebarDrawerOpen);
  const isRightPanelOpen = useUIStore((state) => state.isRightPanelOpen);
  const setRightPanelOpen = useUIStore((state) => state.setRightPanelOpen);
  const isDetailsSheetOpen = useUIStore((state) => state.isDetailsSheetOpen);
  const setDetailsSheetOpen = useUIStore((state) => state.setDetailsSheetOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const toggleRightPanel = useUIStore((state) => state.toggleRightPanel);
  const setSearchOpen = useUIStore((state) => state.setSearchOpen);
  const setShortcutsOpen = useUIStore((state) => state.setShortcutsOpen);
  const rightPanelView = useUIStore((state) => state.rightPanelView);
  // Below xl the right-hand surface is a slide-over. Mounting it only there
  // keeps its overlay from covering the desktop layout.
  const isWideDesktop = useMediaQuery("(min-width: 1280px)");
  const activeNavSection = useWorkspaceStore((state) => state.activeNavSection);
  const activeThreadRootId = useUIStore((state) => state.activeThreadRootId);

  // Outside a conversation, only a thread is worth the right-hand column.
  const isThreadOpen = rightPanelView === "thread" && Boolean(activeThreadRootId);
  const showRightPanel = isRightPanelOpen && (activeNavSection === "home" || isThreadOpen);

  useRealtimeBridge();

  useHotkeys(
    React.useMemo(
      () => [
        { key: "k", mod: true, allowInInput: true, handler: () => setSearchOpen(true) },
        { key: "b", mod: true, handler: toggleSidebar },
        {
          key: ".",
          mod: true,
          // Below xl the details surface is a slide-over, not an inline column.
          handler: () =>
            window.matchMedia("(min-width: 1280px)").matches
              ? toggleRightPanel()
              : setDetailsSheetOpen(!useUIStore.getState().isDetailsSheetOpen),
        },
        { key: "/", mod: true, handler: () => setShortcutsOpen(true) },
      ],
      [setDetailsSheetOpen, setSearchOpen, setShortcutsOpen, toggleRightPanel, toggleSidebar],
    ),
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-canvas text-fg">
      <WorkspaceBootstrap />
      <TopBar />

      <div className="flex min-h-0 flex-1">
        {/* Inline sidebar — desktop and large tablets */}
        <aside
          aria-label="Workspace"
          className={cn(
            "hidden shrink-0 lg:block",
            isSidebarCollapsed ? "w-16" : "w-[var(--spacing-sidebar)]",
          )}
        >
          <WorkspaceSidebar isCollapsed={isSidebarCollapsed} />
        </aside>

        {/* Centre column */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col border-border lg:border-l">
          {children}
        </main>

        {/* Inline details panel — wide desktop only */}
        {showRightPanel && (
          <aside
            aria-label="Conversation details"
            className="hidden w-[var(--spacing-rightpanel)] shrink-0 border-l border-border xl:block"
          >
            <RightPanel onClose={() => setRightPanelOpen(false)} />
          </aside>
        )}
      </div>

      <MobileTabBar />

      {/* Sidebar drawer — below lg */}
      <Sheet open={isDrawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" showClose={false} className="border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Channels, direct messages and workspace navigation.
          </SheetDescription>
          <WorkspaceSidebar showCollapseToggle={false} onClose={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Details / thread slide-over — below xl only */}
      {!isWideDesktop && (
        <Sheet open={isDetailsSheetOpen} onOpenChange={setDetailsSheetOpen}>
          <SheetContent side="right" showClose={false} className="p-0">
            <SheetTitle className="sr-only">Conversation details</SheetTitle>
            <SheetDescription className="sr-only">
              About, pinned messages, members, files and threads for the current conversation.
            </SheetDescription>
            <RightPanel onClose={() => setDetailsSheetOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      <SearchDialog />
      <ShortcutsDialog />
      <ChannelDialogs />
    </div>
  );
}
