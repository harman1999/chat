"use client";

import { LayoutGrid, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Hint } from "@/components/ui/tooltip";
import { usePermission } from "@/hooks";
import { initialsOf } from "@/lib/format";
import { ALL_TEAMS, NO_TEAM, type Badge, type ChannelSections } from "@/lib/team-filter";
import { cn } from "@/lib/utils";
import type { Team } from "@/types";

/** Says what a tile is holding back: a number for mentions, a dot for plain unread. */
function describe(badge: Badge | undefined): string {
  if (!badge) return "";
  if (badge.mentions > 0) return `, ${badge.mentions} ${badge.mentions === 1 ? "mention" : "mentions"}`;
  if (badge.unread > 0) return ", unread messages";
  return "";
}

function Marker({ badge }: { badge: Badge | undefined }) {
  if (!badge) return null;
  if (badge.mentions > 0) {
    return (
      <span
        aria-hidden
        className="absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-accent-fg tabular-nums ring-2 ring-sidebar"
      >
        {badge.mentions > 99 ? "99+" : badge.mentions}
      </span>
    );
  }
  if (badge.unread > 0) {
    return <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-sidebar-fg ring-2 ring-sidebar" />;
  }
  return null;
}

function Tile({
  label,
  selected,
  badge,
  onSelect,
  children,
}: {
  label: string;
  selected: boolean;
  /** What the tile is hiding while it is not the one chosen. */
  badge?: Badge;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const news = selected ? undefined : badge;
  return (
    <Hint label={label} side="right">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${label}${describe(news)}`}
        className={cn(
          "relative grid size-10 shrink-0 place-items-center rounded-lg text-xs font-bold transition-colors focus-sidebar",
          selected
            ? "bg-sidebar-active text-sidebar-active-fg ring-2 ring-sidebar-ring"
            : "bg-sidebar-hover text-sidebar-muted hover:text-sidebar-fg hover:brightness-125",
        )}
      >
        {children}
        <Marker badge={news} />
      </button>
    </Hint>
  );
}

/**
 * A column of team tiles down the left edge, beside the channel list: choosing
 * one shows that team's channels, and the tile at the top shows everything.
 *
 * A tile that is not chosen carries what it is holding back — a number for
 * mentions, a dot for unread messages — so choosing one team never makes the
 * others' news disappear. Channels with no team are behind the top tile, so it
 * carries their share while a team is chosen.
 */
export function TeamRail({ sections, onSelect }: { sections: ChannelSections; onSelect: (filter: string) => void }) {
  const router = useRouter();
  const canCreate = usePermission("p_team_manage");
  const isAll = sections.filter === ALL_TEAMS;
  // Whatever is not a team's: shown under All, so it is All's to announce.
  const looseBadge = sections.badges[NO_TEAM];

  return (
    <nav
      aria-label="Teams"
      className="flex h-full w-[var(--spacing-teamrail)] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-sidebar-border bg-sidebar py-3 scrollbar-thin"
    >
      <Tile label="All teams" selected={isAll} badge={looseBadge} onSelect={() => onSelect(ALL_TEAMS)}>
        <LayoutGrid className="size-4.5" aria-hidden />
      </Tile>

      <div className="h-px w-6 bg-sidebar-border" aria-hidden />

      {sections.options.map((team: Team) => (
        <Tile
          key={team.id}
          label={team.name}
          selected={sections.filter === team.id}
          badge={sections.badges[team.id]}
          onSelect={() => onSelect(team.id)}
        >
          {initialsOf(team.name)}
        </Tile>
      ))}

      {canCreate && (
        <Hint label="Create a team" side="right">
          <button
            type="button"
            onClick={() => router.push("/admin/teams")}
            aria-label="Create a team"
            className="mt-auto grid size-10 shrink-0 place-items-center rounded-lg border border-dashed border-sidebar-border text-sidebar-subtle transition-colors hover:border-sidebar-subtle hover:text-sidebar-fg focus-sidebar"
          >
            <Plus className="size-4.5" aria-hidden />
          </button>
        </Hint>
      )}
    </nav>
  );
}
