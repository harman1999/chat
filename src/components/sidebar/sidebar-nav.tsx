"use client";

import {
  Bell,
  Bookmark,
  Home,
  MessagesSquare,
  MoreHorizontal,
  PencilLine,
  Search,
  ShieldCheck,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UnreadBadge } from "@/components/common";
import { useMentions, useThreadUnreadTotal } from "@/hooks";
import { useUIStore, useWorkspaceStore, type NavSection } from "@/store";
import { SidebarItem } from "./sidebar-item";

/** `badge` is filled in at render time for sections with live counts. */
const NAV_ITEMS: { id: NavSection; label: string; icon: typeof Home; badge?: number }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "threads", label: "Threads", icon: MessagesSquare },
  { id: "mentions", label: "Mentions", icon: Bell },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "drafts", label: "Drafts", icon: PencilLine },
];

export function SidebarNav({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const router = useRouter();
  const activeSection = useWorkspaceStore((state) => state.activeNavSection);
  const setNavSection = useWorkspaceStore((state) => state.setNavSection);
  const setSearchOpen = useUIStore((state) => state.setSearchOpen);
  const unreadThreads = useThreadUnreadTotal();
  const { data: mentions } = useMentions();

  return (
    <nav aria-label="Workspace navigation" className="space-y-px">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const badge =
          item.id === "threads"
            ? unreadThreads
            : item.id === "mentions"
              ? mentions?.length ?? 0
              : item.badge;
        return (
          <SidebarItem
            key={item.id}
            leading={<Icon />}
            label={item.label}
            isActive={activeSection === item.id}
            isUnread={Boolean(badge)}
            isCollapsed={isCollapsed}
            trailing={badge ? <UnreadBadge count={badge} /> : undefined}
            onClick={() => setNavSection(item.id)}
          />
        );
      })}

      <SidebarItem
        leading={<Search />}
        label="Search"
        isCollapsed={isCollapsed}
        tooltipShortcut="⌘K"
        onClick={() => setSearchOpen(true)}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarItem leading={<MoreHorizontal />} label="More" isCollapsed={isCollapsed} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" className="w-56">
          <DropdownMenuItem onSelect={() => router.push("/settings")}>
            <Settings />
            Preferences
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            <ShieldCheck />
            Administration
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push("/design-system")}>
            <PencilLine />
            Design system
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
