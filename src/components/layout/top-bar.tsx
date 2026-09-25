"use client";

import { Menu } from "lucide-react";
import { NotificationsButton } from "@/components/notifications";
import { UserMenu } from "@/components/profile/user-menu";
import { SearchTrigger } from "@/components/search";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUIStore } from "@/store";
import { ThemeToggle } from "./theme-toggle";

/**
 * Global application bar. Spans the full width above the three-column body so
 * search stays reachable regardless of which panel has focus.
 */
export function TopBar() {
  const setDrawerOpen = useUIStore((state) => state.setSidebarDrawerOpen);

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
