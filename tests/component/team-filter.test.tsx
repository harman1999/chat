import { describe, expect, it } from "vitest";
import { ALL_TEAMS, NO_TEAM, sectionChannels } from "@/lib/team-filter";
import type { Channel, Team } from "@/types";

const channel = (id: string, teamId: string | null, extra: Partial<Channel> = {}): Channel => ({
  id, workspaceId: "ws", kind: "public", name: id, purpose: "", description: "", topic: null,
  memberIds: [], memberCount: 1, unreadCount: 0, mentionCount: 0, isMuted: false, isFavorite: false,
  isArchived: false, lastMessageAt: null, createdAt: "2026-01-01T00:00:00Z", createdBy: "u", teamId, ...extra,
});
const team = (id: string, isMember = true): Team => ({
  id, name: id, description: "", memberCount: 1, channelCount: 0, isMember, createdAt: "2026-01-01T00:00:00Z",
});

const channels = [
  channel("general", null, { unreadCount: 2 }),
  channel("backend", "eng", { unreadCount: 5 }),
  channel("frontend", "eng", { mentionCount: 1, unreadCount: 3 }),
  channel("tickets", "support", { unreadCount: 4, isMuted: true }),
  channel("standup", "support"),
];
const teams = [team("eng"), team("support"), team("design")];

const ids = (list: Channel[]) => list.map((item) => item.id);

describe("the team filter", () => {
  it("shows everything for 'all teams', with teams that have channels as sections", () => {
    const result = sectionChannels(channels, teams, ALL_TEAMS);
    expect(ids(result.loose)).toEqual(["general"]);
    expect(result.teams.map((section) => section.team.id)).toEqual(["eng", "support"]);
    expect(result.hidden).toEqual({ mentions: 0, unread: 0 });
  });

  it("shows only one team's channels when it is chosen", () => {
    const result = sectionChannels(channels, teams, "eng");
    expect(result.loose).toEqual([]);
    expect(result.teams).toHaveLength(1);
    expect(ids(result.teams[0].channels)).toEqual(["backend", "frontend"]);
  });

  it("shows only channels without a team for 'no team'", () => {
    const result = sectionChannels(channels, teams, NO_TEAM);
    expect(ids(result.loose)).toEqual(["general"]);
    expect(result.teams).toEqual([]);
  });

  it("never hides news: what the filter hides is counted", () => {
    // Filtered to support: hides general (2 unread), backend (5), frontend (1 mention, not its 3 unread).
    expect(sectionChannels(channels, teams, "support").hidden).toEqual({ mentions: 1, unread: 7 });
    // Muted channels do not count as news.
    expect(sectionChannels(channels, teams, "eng").hidden).toEqual({ mentions: 0, unread: 2 });
    expect(sectionChannels(channels, teams, NO_TEAM).hidden).toEqual({ mentions: 1, unread: 5 });
  });

  it("adds up per team for the picker's rows", () => {
    const { badges } = sectionChannels(channels, teams, ALL_TEAMS);
    expect(badges.eng).toEqual({ mentions: 1, unread: 5 });
    expect(badges.support).toEqual({ mentions: 0, unread: 0 });
    expect(badges[NO_TEAM]).toEqual({ mentions: 0, unread: 2 });
  });

  it("shows a chosen team even when it has no channels for you yet", () => {
    const result = sectionChannels(channels, teams, "design");
    expect(result.teams.map((section) => section.team.id)).toEqual(["design"]);
    expect(result.teams[0].channels).toEqual([]);
  });

  it("falls back to everything when the chosen team is gone or you left it", () => {
    for (const stale of ["deleted-team", "other"]) {
      expect(sectionChannels(channels, [...teams, team("other", false)], stale).filter).toBe(ALL_TEAMS);
    }
  });

  it("offers teams you are in, and teams whose channels you can see", () => {
    const seen = [...teams.filter((t) => t.id !== "design"), team("visible-only", false)];
    const withChannel = [...channels, channel("x", "visible-only")];
    expect(sectionChannels(withChannel, seen, ALL_TEAMS).options.map((t) => t.id)).toEqual(["eng", "support", "visible-only"]);
    // A team you are not in and see nothing of is not offered.
    expect(sectionChannels(channels, [team("stranger", false)], ALL_TEAMS).options).toEqual([]);
  });
});
