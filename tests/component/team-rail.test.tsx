import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TeamRail } from "@/components/sidebar/team-rail";
import { ALL_TEAMS, sectionChannels } from "@/lib/team-filter";
import type { Channel, Team } from "@/types";

const push = vi.fn();
let permissions: string[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks", () => ({ usePermission: (id: string) => permissions.includes(id) }));

const channel = (id: string, teamId: string | null, extra: Partial<Channel> = {}): Channel => ({
  id, workspaceId: "ws", kind: "public", name: id, purpose: "", description: "", topic: null,
  memberIds: [], memberCount: 1, unreadCount: 0, mentionCount: 0, isMuted: false, isFavorite: false,
  isArchived: false, lastMessageAt: null, createdAt: "2026-01-01T00:00:00Z", createdBy: "u", teamId, ...extra,
});
const team = (id: string, name: string): Team => ({
  id, name, description: "", memberCount: 1, channelCount: 0, isMember: true, createdAt: "2026-01-01T00:00:00Z",
});

const teams = [team("eng", "Engineering"), team("sup", "Support")];
const channels = [
  channel("general", null),
  channel("backend", "eng", { unreadCount: 4 }),
  channel("tickets", "sup", { mentionCount: 2, unreadCount: 6 }),
];

/**
 * The column of team tiles. What it must never do is hide news: a tile that is
 * not chosen has to say what is waiting behind it.
 */
describe("the team column", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    onSelect.mockClear();
    push.mockClear();
    permissions = [];
  });

  const show = (filter = ALL_TEAMS) =>
    render(
      <TooltipProvider>
        <TeamRail sections={sectionChannels(channels, teams, filter)} onSelect={onSelect} />
      </TooltipProvider>,
    );

  it("has a tile for all teams and one for each team, marking the chosen one", () => {
    show("eng");
    const pressed = screen.getAllByRole("button").filter((tile) => tile.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].getAttribute("aria-label")).toMatch(/^Engineering/);
    expect(screen.getByRole("button", { name: /^All teams/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Support/ })).toBeTruthy();
  });

  it("says what each unchosen tile is holding: a mention count, or unread messages", () => {
    show();
    expect(screen.getByRole("button", { name: "Support, 2 mentions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Engineering, unread messages" })).toBeTruthy();
  });

  it("does not announce news on the tile you are already in", () => {
    show("sup");
    expect(screen.getByRole("button", { name: "Support" })).toBeTruthy();
  });

  it("chooses a team when its tile is clicked", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /^Support/ }));
    expect(onSelect).toHaveBeenCalledWith("sup");
    fireEvent.click(screen.getByRole("button", { name: /^All teams/ }));
    expect(onSelect).toHaveBeenCalledWith(ALL_TEAMS);
  });

  it("offers Create a team only to people who manage teams", () => {
    show();
    expect(screen.queryByRole("button", { name: "Create a team" })).toBeNull();
  });

  it("takes a team manager to the Teams page from the plus", () => {
    permissions = ["p_team_manage"];
    show();
    fireEvent.click(screen.getByRole("button", { name: "Create a team" }));
    expect(push).toHaveBeenCalledWith("/admin/teams");
  });
});
