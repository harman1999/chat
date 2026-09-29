import type { Channel, Team } from "@/types";

/** Show everything: channels without a team, and each team's channels. */
export const ALL_TEAMS = "all";
/** Show only channels that belong to no team. */
export const NO_TEAM = "none";

/** What a group of channels would show as a badge: mentions are loud, unreads quiet. */
export interface Badge {
  mentions: number;
  unread: number;
}

export interface ChannelSections {
  /** The filter actually applied — a stale choice falls back to "all". */
  filter: string;
  /** Channels with no team, shown under Channels. */
  loose: Channel[];
  /** Team sections to show, each with its channels (possibly none, for a chosen team). */
  teams: { team: Team; channels: Channel[] }[];
  /** The teams offered by the filter: those you are in, or have a channel of. */
  options: Team[];
  /** Unread inside channels the filter is hiding, so a filter never hides news. */
  hidden: Badge;
  /** Per team, and under NO_TEAM for channels without one — for the picker's rows. */
  badges: Record<string, Badge>;
}

/**
 * Splits the channel list into what the sidebar shows, given a team filter.
 *
 * Mirrors the sidebar's own rule for a row's badge: a channel with a mention
 * shows the mention count, otherwise its unread count unless it is muted. So the
 * picker's numbers add up to what the rows would have shown.
 */
export function sectionChannels(channels: Channel[], teams: Team[], requested: string): ChannelSections {
  const options = teams.filter(
    (team) => team.isMember || channels.some((channel) => channel.teamId === team.id),
  );

  const filter =
    requested === ALL_TEAMS || requested === NO_TEAM || options.some((team) => team.id === requested)
      ? requested
      : ALL_TEAMS;

  const of = (teamId: string) => channels.filter((channel) => channel.teamId === teamId);
  const loose = channels.filter((channel) => !channel.teamId);

  const badge = (list: Channel[]): Badge =>
    list.reduce<Badge>(
      (sum, channel) =>
        channel.mentionCount > 0
          ? { ...sum, mentions: sum.mentions + channel.mentionCount }
          : { ...sum, unread: sum.unread + (channel.isMuted ? 0 : channel.unreadCount) },
      { mentions: 0, unread: 0 },
    );

  const badges: Record<string, Badge> = { [NO_TEAM]: badge(loose) };
  for (const team of options) badges[team.id] = badge(of(team.id));

  let shownLoose: Channel[] = [];
  let shownTeams: ChannelSections["teams"] = [];
  if (filter === ALL_TEAMS) {
    shownLoose = loose;
    shownTeams = options.map((team) => ({ team, channels: of(team.id) })).filter((section) => section.channels.length > 0);
  } else if (filter === NO_TEAM) {
    shownLoose = loose;
  } else {
    const chosen = options.find((team) => team.id === filter);
    if (chosen) shownTeams = [{ team: chosen, channels: of(chosen.id) }];
  }

  const shown = new Set([...shownLoose, ...shownTeams.flatMap((section) => section.channels)].map((c) => c.id));
  const hidden = badge(channels.filter((channel) => !shown.has(channel.id)));

  return { filter, loose: shownLoose, teams: shownTeams, options, hidden, badges };
}
