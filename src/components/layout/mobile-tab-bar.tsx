"use client";

import { Bell, Home, MessagesSquare, MoreHorizontal, Search } from "lucide-react";
import { useThreadUnreadTotal, useUnreadMentionTotal } from "@/hooks";
import { useUIStore, useWorkspaceStore, type NavSection } from "@/store";
import { cn } from "@/lib/utils";

const TABS: {
  id: NavSection | "search";
  label: string;
  icon: typeof Home;
}[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "threads", label: "Threads", icon: MessagesSquare },
  { id: "search", label: "Search", icon: Search },
  { id: "mentions", label: "Activity", icon: Bell },
];

/**
 * Mobile-only bottom navigation. Sits below the composer and respects the
 * home-indicator safe area.
 *
 * Coloured as the sidebar, which it stands in for on a phone, by using the same
 * tokens: the two are always the same blue and read as one piece of navigation,
 * instead of a bar under a drawer that does not match it.
 */
export function MobileTabBar() {
  const activeSection = useWorkspaceStore((state) => state.activeNavSection);
  const setNavSection = useWorkspaceStore((state) => state.setNavSection);
  const setSearchOpen = useUIStore((state) => state.setSearchOpen);
  const setDrawerOpen = useUIStore((state) => state.setSidebarDrawerOpen);
  const unreadThreads = useThreadUnreadTotal();
  const unreadMentions = useUnreadMentionTotal();

  const badgeFor = (id: (typeof TABS)[number]["id"]) => {
    if (id === "threads") return unreadThreads;
    if (id === "mentions") return unreadMentions;
    return 0;
  };

  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 items-stretch border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id !== "search" && activeSection === tab.id;
        const badge = badgeFor(tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => (tab.id === "search" ? setSearchOpen(true) : setNavSection(tab.id as NavSection))}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.625rem] font-medium transition-colors focus-sidebar",
              isActive ? "text-sidebar-fg" : "text-sidebar-subtle hover:text-sidebar-fg",
            )}
          >
            {/* The current tab sits in a pill, as the current row does in the sidebar. */}
            <span
              className={cn(
                "relative rounded-full px-3.5 py-0.5 transition-colors",
                isActive && "bg-sidebar-active text-sidebar-active-fg",
              )}
            >
              <Icon className="size-[18px]" aria-hidden />
              {badge ? (
                <span className="absolute -right-0.5 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-accent px-1 text-[0.5rem] font-bold leading-none text-accent-fg ring-2 ring-sidebar">
                  {badge}
                </span>
              ) : null}
            </span>
            {tab.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.625rem] font-medium text-sidebar-subtle transition-colors hover:text-sidebar-fg focus-sidebar"
      >
        <span className="px-3.5 py-0.5">
          <MoreHorizontal className="size-[18px]" aria-hidden />
        </span>
        More
      </button>
    </nav>
  );
}
