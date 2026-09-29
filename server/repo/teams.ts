import { randomUUID } from "node:crypto";
import { query, queryOne, transaction } from "../db/client";
import { mapUser, USER_COLUMNS, type UserRow } from "./users";
import type { Team, User } from "../../src/types";

interface TeamRow {
  id: string;
  name: string;
  description: string;
  created_at: Date;
  member_count: string;
  channel_count: string;
  is_member: boolean;
}

const TEAM_SELECT = `
  SELECT t.id, t.name, t.description, t.created_at,
         (SELECT count(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count,
         (SELECT count(*) FROM channels c
            WHERE c.team_id = t.id AND c.kind IN ('public','private') AND NOT c.is_archived) AS channel_count,
         EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $2) AS is_member
    FROM teams t
`;

function mapTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    memberCount: Number(row.member_count),
    channelCount: Number(row.channel_count),
    isMember: row.is_member,
    createdAt: row.created_at.toISOString(),
  };
}

const UNIQUE_VIOLATION = "23505";
const isNameClash = (error: unknown) => (error as { code?: string })?.code === UNIQUE_VIOLATION;

/**
 * Teams: named groups of people inside the workspace, with channels of their own.
 *
 * Access is still decided by `channel_members`, the table every read check trusts.
 * A team only fills it in bulk: joining a team puts you in the team's channels,
 * leaving takes you out, and a channel added to a team gets the team's people.
 * Everything is scoped to a workspace here, so a team id from another workspace
 * is simply not found.
 */
export const teamsRepo = {
  async list(workspaceId: string, viewerId: string): Promise<Team[]> {
    const rows = await query<TeamRow>(
      `${TEAM_SELECT} WHERE t.workspace_id = $1 ORDER BY lower(t.name) LIMIT 200`,
      [workspaceId, viewerId],
    );
    return rows.map(mapTeam);
  },

  async get(workspaceId: string, teamId: string, viewerId: string): Promise<Team | null> {
    const row = await queryOne<TeamRow>(`${TEAM_SELECT} WHERE t.workspace_id = $1 AND t.id = $3`, [
      workspaceId,
      viewerId,
      teamId,
    ]);
    return row ? mapTeam(row) : null;
  },

  async exists(workspaceId: string, teamId: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(`SELECT id FROM teams WHERE id = $1 AND workspace_id = $2`, [
      teamId,
      workspaceId,
    ]);
    return Boolean(row);
  },

  async create(input: {
    workspaceId: string;
    name: string;
    description: string;
    createdBy: string;
  }): Promise<{ ok: true; teamId: string } | { ok: false; reason: "name_taken" }> {
    const teamId = `team_${randomUUID()}`;
    try {
      await query(
        `INSERT INTO teams (id, workspace_id, name, description, created_by) VALUES ($1,$2,$3,$4,$5)`,
        [teamId, input.workspaceId, input.name, input.description, input.createdBy],
      );
    } catch (error) {
      if (isNameClash(error)) return { ok: false, reason: "name_taken" };
      throw error;
    }
    return { ok: true, teamId };
  },

  async update(
    workspaceId: string,
    teamId: string,
    patch: { name?: string; description?: string },
  ): Promise<"ok" | "not_found" | "name_taken"> {
    try {
      const rows = await query<{ id: string }>(
        `UPDATE teams SET name = COALESCE($3, name), description = COALESCE($4, description)
          WHERE id = $1 AND workspace_id = $2 RETURNING id`,
        [teamId, workspaceId, patch.name ?? null, patch.description ?? null],
      );
      return rows.length ? "ok" : "not_found";
    } catch (error) {
      if (isNameClash(error)) return "name_taken";
      throw error;
    }
  },

  /**
   * Deletes the team. Its channels stay, as ordinary channels, and everyone keeps
   * the access they had: taking a team apart should not lock people out of
   * conversations they were in.
   */
  async remove(workspaceId: string, teamId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(`DELETE FROM teams WHERE id = $1 AND workspace_id = $2 RETURNING id`, [
      teamId,
      workspaceId,
    ]);
    return rows.length > 0;
  },

  async members(workspaceId: string, teamId: string): Promise<User[]> {
    const rows = await query<UserRow>(
      `SELECT ${USER_COLUMNS}
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id AND t.workspace_id = $2
         JOIN users u ON u.id = tm.user_id AND u.workspace_id = t.workspace_id
        WHERE tm.team_id = $1
        ORDER BY u.display_name
        LIMIT 1000`,
      [teamId, workspaceId],
    );
    return rows.map(mapUser);
  },

  async memberIds(workspaceId: string, teamId: string): Promise<string[]> {
    const rows = await query<{ user_id: string }>(
      `SELECT tm.user_id FROM team_members tm JOIN teams t ON t.id = tm.team_id AND t.workspace_id = $2
        WHERE tm.team_id = $1`,
      [teamId, workspaceId],
    );
    return rows.map((row) => row.user_id);
  },

  /**
   * Adds people to a team and to each of the team's channels, in one step.
   *
   * Only people of this workspace who are real, active accounts: a bot is not a
   * team member, and a deactivated account should not be handed channels. Those
   * already in the team are skipped. Returns the people actually added, or null
   * if the team is not in this workspace.
   */
  async addMembers(workspaceId: string, teamId: string, userIds: string[]): Promise<string[] | null> {
    return transaction(async (client) => {
      const team = await client.query(`SELECT 1 FROM teams WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [
        teamId,
        workspaceId,
      ]);
      if (team.rowCount === 0) return null;

      const added = (
        await client.query<{ user_id: string }>(
          `INSERT INTO team_members (team_id, user_id)
           SELECT $1, u.id FROM users u
            WHERE u.id = ANY($2::text[]) AND u.workspace_id = $3
              AND NOT u.is_bot AND u.account_status <> 'deactivated'
           ON CONFLICT DO NOTHING
           RETURNING user_id`,
          [teamId, userIds, workspaceId],
        )
      ).rows.map((row) => row.user_id);

      if (added.length > 0) {
        // last_read_at = now(): someone joining should not open to a wall of
        // "unread" from before they were there. channels.member_count follows
        // from a trigger (migration 0003).
        await client.query(
          `INSERT INTO channel_members (channel_id, user_id, last_read_at)
           SELECT c.id, member, now()
             FROM channels c CROSS JOIN unnest($2::text[]) AS member
            WHERE c.team_id = $1 AND c.workspace_id = $3
              AND c.kind IN ('public','private') AND NOT c.is_archived
           ON CONFLICT (channel_id, user_id) DO NOTHING`,
          [teamId, added, workspaceId],
        );
      }
      return added;
    });
  },

  /** Takes someone out of the team and out of its channels. False if they were not in it. */
  async removeMember(workspaceId: string, teamId: string, userId: string): Promise<boolean> {
    return transaction(async (client) => {
      const removed = await client.query(
        `DELETE FROM team_members tm USING teams t
          WHERE tm.team_id = $1 AND tm.user_id = $2 AND t.id = tm.team_id AND t.workspace_id = $3`,
        [teamId, userId, workspaceId],
      );
      if (!removed.rowCount) return false;
      await client.query(
        `DELETE FROM channel_members
          WHERE user_id = $2
            AND channel_id IN (SELECT id FROM channels
                                WHERE team_id = $1 AND workspace_id = $3 AND kind IN ('public','private'))`,
        [teamId, userId, workspaceId],
      );
      return true;
    });
  },

  async channels(
    workspaceId: string,
    teamId: string,
  ): Promise<{ id: string; name: string; kind: "public" | "private"; memberCount: number }[]> {
    const rows = await query<{ id: string; name: string; kind: "public" | "private"; member_count: number }>(
      `SELECT id, name, kind, member_count FROM channels
        WHERE team_id = $1 AND workspace_id = $2 AND kind IN ('public','private') AND NOT is_archived
        ORDER BY name LIMIT 500`,
      [teamId, workspaceId],
    );
    return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, memberCount: row.member_count }));
  },

  /**
   * Puts an existing channel in the team, and the team's people in the channel.
   * A channel moved from another team keeps the people it already has: moving it
   * should not quietly remove anyone.
   */
  async attachChannel(
    workspaceId: string,
    teamId: string,
    channelId: string,
  ): Promise<{ ok: true; addedUserIds: string[] } | { ok: false; reason: "not_found" }> {
    return transaction(async (client) => {
      const found = await client.query(
        `SELECT 1 FROM teams t, channels c
          WHERE t.id = $1 AND t.workspace_id = $3 AND c.id = $2 AND c.workspace_id = $3
            AND c.kind IN ('public','private')`,
        [teamId, channelId, workspaceId],
      );
      if (found.rowCount === 0) return { ok: false as const, reason: "not_found" as const };

      await client.query(`UPDATE channels SET team_id = $2 WHERE id = $1`, [channelId, teamId]);
      const added = await client.query<{ user_id: string }>(
        `INSERT INTO channel_members (channel_id, user_id, last_read_at)
         SELECT $1, tm.user_id, now() FROM team_members tm
          WHERE tm.team_id = $2
         ON CONFLICT (channel_id, user_id) DO NOTHING
         RETURNING user_id`,
        [channelId, teamId],
      );
      return { ok: true as const, addedUserIds: added.rows.map((row) => row.user_id) };
    });
  },

  /** Takes a channel out of the team. Its people stay: it is only the grouping that goes. */
  async detachChannel(workspaceId: string, teamId: string, channelId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE channels SET team_id = NULL WHERE id = $1 AND team_id = $2 AND workspace_id = $3 RETURNING id`,
      [channelId, teamId, workspaceId],
    );
    return rows.length > 0;
  },
};
