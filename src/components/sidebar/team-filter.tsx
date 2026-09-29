"use client";

import { Check, ChevronsUpDown, UsersRound } from "lucide-react";
import { UnreadBadge } from "@/components/common";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ALL_TEAMS, NO_TEAM, type Badge } from "@/lib/team-filter";
import { cn } from "@/lib/utils";
import type { Team } from "@/types";

/** A mention outranks a plain unread, as it does on a channel row. */
function BadgeFor({ badge }: { badge: Badge }) {
  if (badge.mentions > 0) return <UnreadBadge count={badge.mentions} />;
  return <UnreadBadge count={badge.unread} tone="unread" />;
}

function FilterRow({
  id,
  name,
  selected,
  badge,
  onChoose,
}: {
  id: string;
  name: string;
  selected: boolean;
  badge?: Badge;
  onChoose: (id: string) => void;
}) {
  return (
    <DropdownMenuItem onSelect={() => onChoose(id)} className="gap-2">
      <Check className={cn("size-4 shrink-0 !text-accent", !selected && "invisible")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {badge && <BadgeFor badge={badge} />}
    </DropdownMenuItem>
  );
}

/**
 * Chooses which team's channels the sidebar shows.
 *
 * Filtering hides channels, and a hidden channel is one whose unread messages
 * you would not see. So the picker carries a badge for whatever the filter is
 * hiding, and each row shows its own team's — a filter that quietly swallowed
 * news would be worse than none.
 */
export function TeamFilter({
  teams,
  value,
  onChange,
  hidden,
  badges,
}: {
  teams: Team[];
  value: string;
  onChange: (filter: string) => void;
  hidden: Badge;
  badges: Record<string, Badge>;
}) {
  const chosen = teams.find((team) => team.id === value);
  const label = value === ALL_TEAMS ? "All teams" : value === NO_TEAM ? "No team" : (chosen?.name ?? "All teams");
  const isFiltered = value !== ALL_TEAMS;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Team filter: ${label}`}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors focus-sidebar",
          "hover:bg-sidebar-hover data-[state=open]:bg-sidebar-hover",
          isFiltered ? "font-medium text-sidebar-fg" : "text-sidebar-subtle hover:text-sidebar-fg",
        )}
      >
        <UsersRound className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {/* News the filter is hiding — shown only while something is. */}
        {isFiltered && <BadgeFor badge={hidden} />}
        <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-subtle" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60" sideOffset={4}>
        <FilterRow id={ALL_TEAMS} name="All teams" selected={value === ALL_TEAMS} onChoose={onChange} />
        <DropdownMenuSeparator />
        {teams.map((team) => (
          <FilterRow
            key={team.id}
            id={team.id}
            name={team.name}
            selected={value === team.id}
            badge={badges[team.id]}
            onChoose={onChange}
          />
        ))}
        <DropdownMenuSeparator />
        <FilterRow id={NO_TEAM} name="No team" selected={value === NO_TEAM} badge={badges[NO_TEAM]} onChoose={onChange} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
