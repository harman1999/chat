import { randomUUID } from "node:crypto";
import { query, queryOne, transaction } from "../db/client";
import type { Channel, ChannelKind, User } from "../../src/types";
import { mapUser, USER_COLUMNS, type UserRow } from "./users";

interface ChannelRow {
  id: string;
  kind: ChannelKind;
  name: string;
  purpose: string;
  description: string;
  topic: string | null;
  member_count: number;
  is_archived: boolean;
  last_message_at: Date | null;
  created_by: string | null;
  created_at: Date;
  is_muted: boolean | null;
  is_favorite: boolean | null;
  unread_count: string | null;
  mention_count: string | null;
  member_ids: string[] | null;
  participant_ids: string[] | null;
  dm_name: string | null;
}

/**
 * Per-member state (unread, mentions, mute) is computed against the caller's
 * `last_read_at`, so the same channel row is different for every viewer. Doing
 * it in one query avoids an N+1 per channel in the sidebar.
 */
const CHANNEL_SELECT = `
  SELECT c.id, c.kind, c.name, c.purpose, c.description, c.topic,
         c.member_count, c.is_archived, c.last_message_at, c.created_by, c.created_at,
         cm.is_muted, cm.is_favorite,
         (SELECT count(*) FROM messages m
            WHERE m.channel_id = c.id AND m.thread_root_id IS NULL
              AND m.deleted_at IS NULL AND m.created_at > cm.last_read_at
              AND m.author_id <> $2) AS unread_count,
         (SELECT count(*) FROM messages m
            JOIN message_mentions mm ON mm.message_id = m.id AND mm.user_id = $2
            WHERE m.channel_id = c.id AND m.deleted_at IS NULL
              AND m.created_at > cm.last_read_at) AS mention_count,
         (SELECT array_agg(cm2.user_id ORDER BY cm2.joined_at) FROM channel_members cm2
            WHERE cm2.channel_id = c.id) AS member_ids,
         (SELECT array_agg(cm3.user_id) FROM channel_members cm3
            WHERE cm3.channel_id = c.id AND cm3.user_id <> $2) AS participant_ids,
         (SELECT string_agg(u2.display_name, ', ' ORDER BY u2.display_name)
            FROM channel_members cm4 JOIN users u2 ON u2.id = cm4.user_id
            WHERE cm4.channel_id = c.id AND cm4.user_id <> $2) AS dm_name
  FROM channels c
  JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
`;

function mapChannel(row: ChannelRow, workspaceId: string): Channel {
  const isDm = row.kind === "dm" || row.kind === "group_dm";
  return {
    id: row.id,
    workspaceId,
    kind: row.kind,
    // A DM has no name of its own — it is named after the other participants.
    name: isDm ? row.dm_name ?? row.name : row.name,
    purpose: row.purpose,
    description: row.description,
    topic: row.topic,
    memberIds: row.member_ids ?? [],
    participantIds: isDm ? row.participant_ids ?? [] : undefined,
    memberCount: row.member_count,
    unreadCount: Number(row.unread_count ?? 0),
    mentionCount: Number(row.mention_count ?? 0),
    isMuted: row.is_muted ?? false,
    isFavorite: row.is_favorite ?? false,
    isArchived: row.is_archived,
    lastMessageAt: row.last_message_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by ?? "",
  };
}

export const channelsRepo = {
  async listChannels(workspaceId: string, userId: string): Promise<Channel[]> {
    const rows = await query<ChannelRow>(
      `${CHANNEL_SELECT}
       WHERE c.workspace_id = $1 AND c.kind IN ('public','private') AND NOT c.is_archived
       ORDER BY c.name
       LIMIT 500`,
      [workspaceId, userId],
    );
    return rows.map((row) => mapChannel(row, workspaceId));
  },

  async listDirectMessages(workspaceId: string, userId: string): Promise<Channel[]> {
    const rows = await query<ChannelRow>(
      `${CHANNEL_SELECT}
       WHERE c.workspace_id = $1 AND c.kind IN ('dm','group_dm')
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT 200`,
      [workspaceId, userId],
    );
    return rows.map((row) => mapChannel(row, workspaceId));
  },

  async get(channelId: string, userId: string, workspaceId: string): Promise<Channel | null> {
    const row = await queryOne<ChannelRow>(`${CHANNEL_SELECT} WHERE c.id = $1 AND c.workspace_id = $3`, [
      channelId,
      userId,
      workspaceId,
    ]);
    return row ? mapChannel(row, workspaceId) : null;
  },

  /** Batched `get`, for callers resolving several conversations at once. */
  async getMany(
    channelIds: string[],
    userId: string,
    workspaceId: string,
  ): Promise<Map<string, Channel>> {
    if (channelIds.length === 0) return new Map();
    const rows = await query<ChannelRow>(
      `${CHANNEL_SELECT} WHERE c.id = ANY($1::text[]) AND c.workspace_id = $3`,
      [channelIds, userId, workspaceId],
    );
    return new Map(rows.map((row) => [row.id, mapChannel(row, workspaceId)]));
  },

  async isMember(channelId: string, userId: string): Promise<boolean> {
    const row = await queryOne<{ ok: boolean }>(
      `SELECT true AS ok FROM channel_members WHERE channel_id = $1 AND user_id = $2`,
      [channelId, userId],
    );
    return Boolean(row);
  },

  /**
   * Channel members, capped. The details panel shows the first handful and
   * links to a full list, so a 400-member channel must not ship 400 rows to
   * render five avatars.
   */
  async members(channelId: string, limit = 100): Promise<User[]> {
    const rows = await query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users u
       JOIN channel_members cm ON cm.user_id = u.id
       WHERE cm.channel_id = $1
       ORDER BY u.display_name
       LIMIT $2`,
      [channelId, limit],
    );
    return rows.map(mapUser);
  },

  /**
   * Creates a channel and adds its creator. `member_count` is denormalised on
   * the row and kept true by a trigger (migration 0003), so the seed value
   * below is corrected the moment the creator's membership lands.
   */
  async create(input: {
    workspaceId: string;
    kind: "public" | "private";
    name: string;
    purpose: string;
    createdBy: string;
  }): Promise<Channel | null> {
    const id = `ch_${randomUUID()}`;

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO channels (id, workspace_id, kind, name, purpose, description, member_count, created_by)
         VALUES ($1,$2,$3,$4,$5,$5,1,$6)`,
        [id, input.workspaceId, input.kind, input.name, input.purpose, input.createdBy],
      );
      await client.query(
        `INSERT INTO channel_members (channel_id, user_id, last_read_at) VALUES ($1,$2,now())`,
        [id, input.createdBy],
      );
    });

    return channelsRepo.get(id, input.createdBy, input.workspaceId);
  },

  async nameTaken(workspaceId: string, name: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      `SELECT id FROM channels WHERE workspace_id = $1 AND lower(name) = lower($2)`,
      [workspaceId, name],
    );
    return Boolean(row);
  },

  /** Returns the ids actually added, skipping people already in the channel. */
  async addMembers(channelId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];

    return transaction(async (client) => {
      const { rows } = await client.query<{ user_id: string }>(
        `INSERT INTO channel_members (channel_id, user_id, last_read_at)
         SELECT $1, u.id, now() FROM users u
         WHERE u.id = ANY($2::text[]) AND u.account_status = 'active'
         ON CONFLICT (channel_id, user_id) DO NOTHING
         RETURNING user_id`,
        [channelId, userIds],
      );
      // member_count is maintained by a trigger (0003). Two mechanisms for one
      // invariant is how it drifted in the first place.
      return rows.map((row) => row.user_id);
    });
  },

  async removeMember(channelId: string, userId: string): Promise<boolean> {
    return transaction(async (client) => {
      const { rowCount } = await client.query(
        `DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2`,
        [channelId, userId],
      );
      return Boolean(rowCount);
    });
  },

  async setArchived(channelId: string, isArchived: boolean): Promise<void> {
    await query(`UPDATE channels SET is_archived = $2 WHERE id = $1`, [channelId, isArchived]);
  },

  async markRead(channelId: string, userId: string): Promise<void> {
    await query(
      `UPDATE channel_members SET last_read_at = now() WHERE channel_id = $1 AND user_id = $2`,
      [channelId, userId],
    );
  },

  async setFavorite(channelId: string, userId: string, isFavorite: boolean): Promise<void> {
    await query(
      `UPDATE channel_members SET is_favorite = $3 WHERE channel_id = $1 AND user_id = $2`,
      [channelId, userId, isFavorite],
    );
  },
};
