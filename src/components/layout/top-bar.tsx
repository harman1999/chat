"use client";

import { useQuery } from "@tanstack/react-query";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NotificationsButton } from "@/components/notifications";
import { UserMenu } from "@/components/profile/user-menu";
import { SearchTrigger } from "@/components/search";
import { WorkspaceSwitcher } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Hint } from "@/components/ui/tooltip";
import { workspaceService } from "@/services";
import { useUIStore } from "@/store";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

/**
 * Global application bar. Spans the full width above the three-column body so
 * search stays reachable regardless of which panel has focus.
 *
 * On desktop the workspace switcher lives here, on the same line as search,
 * in a slot as wide as the sidebar so it still sits directly above it. Below
 * 1024px the sidebar is a drawer and this bar is already full, so the switcher
 * stays in the drawer there instead.
 */
export function TopBar() {
  const setDrawerOpen = useUIStore((state) => state.setSidebarDrawerOpen);
  const isCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);

  // Same key the sidebar used, so this is served from cache, not refetched.
  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => workspaceService.listMine(),
    staleTime: 5 * 60_000,
  });

  return (
    <header
      className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-2 sm:px-3"
      style={{ height: "var(--spacing-topbar)" }}
    >
      <Button
        variant="ghost"
        size="icon-md"
        className="lg:hidden"
        aria-label="Open workspace navigation"
        onClick={() => setDrawerOpen(true)}
      >
        <Menu />
      </Button>

      {/* Desktop only. Width tracks the sidebar — less this bar's own left
          padding — so the switcher's edge lines up with the sidebar's. */}
      <div
        className={cn(
          "hidden shrink-0 items-center gap-1 lg:flex",
          isCollapsed ? "w-auto" : "w-[calc(var(--spacing-sidebar)-0.75rem)]",
        )}
      >
        <div className={cn("min-w-0", !isCollapsed && "flex-1")}>
          <WorkspaceSwitcher
            workspaces={workspaces ?? []}
            isCollapsed={isCollapsed}
            variant="topbar"
          />
        </div>
        <Hint label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} shortcut="⌘B" side="bottom">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={isCollapsed}
          >
            {isCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </Hint>
      </div>

      {/* Flexible so the account cluster is never pushed off-screen on phones. */}
      <div className="min-w-0 flex-1 sm:mx-auto sm:max-w-2xl sm:px-2">
        <SearchTrigger />
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <NotificationsButton />
        <ThemeToggle className="hidden sm:inline-flex" />

        <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
