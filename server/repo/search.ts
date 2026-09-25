import { query } from "../db/client";
import type { SearchResult, SearchResultGroup, SearchResultKind } from "../../src/types";

const GROUP_LABEL: Record<SearchResultKind, string> = {
  message: "Messages",
  person: "People",
  channel: "Channels",
  file: "Files",
};

function channelLabel(kind: string, name: string) {
  return kind === "public" || kind === "private" ? `#${name}` : name;
}

/**
 * Message search uses Postgres full-text search with `websearch_to_tsquery`,
 * which accepts what people actually type (quoted phrases, `or`, `-word`)
 * instead of requiring tsquery syntax. Results are scoped to channels the
 * caller belongs to — search must never reveal a private channel.
 */
export const searchRepo = {
  async search(
    term: string,
    userId: string,
    workspaceId: string,
    kinds: SearchResultKind[] | undefined,
    limit = 6,
  ): Promise<SearchResultGroup[]> {
    const needle = term.trim();
    if (!needle) return [];

    const wanted = (kind: SearchResultKind) => !kinds || kinds.length === 0 || kinds.includes(kind);
    const like = `%${needle}%`;
    const groups: SearchResultGroup[] = [];

    if (wanted("message")) {
      const rows = await query<{
        id: string; channel_id: string; author_id: string; body: string;
        created_at: Date; display_name: string; kind: string; name: string; total: string;
      }>(
        `SELECT m.id, m.channel_id, m.author_id, m.body, m.created_at,
                u.display_name, c.kind, c.name,
                count(*) OVER () AS total
         FROM messages m
         JOIN users u ON u.id = m.author_id
         JOIN channels c ON c.id = m.channel_id
         JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
         WHERE c.workspace_id = $3 AND m.deleted_at IS NULL
           AND to_tsvector('english', m.body) @@ websearch_to_tsquery('english', $1)
         ORDER BY m.created_at DESC
         LIMIT $4`,
        [needle, userId, workspaceId, limit],
      );

      if (rows.length > 0) {
        groups.push({
          kind: "message",
          label: GROUP_LABEL.message,
          total: Number(rows[0].total),
          results: rows.map<SearchResult>((row) => ({
            id: `sr_message_${row.id}`,
            kind: "message",
            title: row.display_name,
            snippet: row.body.replace(/\s+/g, " ").slice(0, 160),
            contextLabel: channelLabel(row.kind, row.name),
            timestamp: row.created_at.toISOString(),
            refId: row.id,
            channelId: row.channel_id,
            authorId: row.author_id,
          })),
        });
      }
    }

    if (wanted("person")) {
      const rows = await query<{
        id: string; display_name: string; title: string; department: string;
        presence: string; total: string;
      }>(
        `SELECT id, display_name, title, department, presence, count(*) OVER () AS total
         FROM users
         WHERE workspace_id = $2 AND account_status <> 'deactivated'
           AND (display_name ILIKE $1 OR username ILIKE $1 OR title ILIKE $1 OR email ILIKE $1)
         ORDER BY display_name LIMIT $3`,
        [like, workspaceId, limit],
      );

      if (rows.length > 0) {
        groups.push({
          kind: "person",
          label: GROUP_LABEL.person,
          total: Number(rows[0].total),
          results: rows.map<SearchResult>((row) => ({
            id: `sr_person_${row.id}`,
            kind: "person",
            title: row.display_name,
            snippet: row.title,
            contextLabel: row.presence === "online" ? "Online" : row.department,
            timestamp: null,
            refId: row.id,
          })),
        });
      }
    }

    if (wanted("channel")) {
      const rows = await query<{
        id: string; kind: string; name: string; purpose: string;
        member_count: number; last_message_at: Date | null; total: string;
      }>(
        `SELECT c.id, c.kind, c.name, c.purpose, c.member_count, c.last_message_at,
                count(*) OVER () AS total
         FROM channels c
         JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
         WHERE c.workspace_id = $3 AND (c.name ILIKE $1 OR c.purpose ILIKE $1)
         ORDER BY c.name LIMIT $4`,
        [like, userId, workspaceId, limit],
      );

      if (rows.length > 0) {
        groups.push({
          kind: "channel",
          label: GROUP_LABEL.channel,
          total: Number(rows[0].total),
          results: rows.map<SearchResult>((row) => ({
            id: `sr_channel_${row.id}`,
            kind: "channel",
            title: channelLabel(row.kind, row.name),
            snippet: row.purpose || "Direct message",
            contextLabel: `${row.member_count.toLocaleString()} members`,
            timestamp: row.last_message_at?.toISOString() ?? null,
            refId: row.id,
            channelId: row.id,
          })),
        });
      }
    }

    if (wanted("file")) {
      const rows = await query<{
        id: string; name: string; channel_id: string; uploaded_by: string;
        uploaded_at: Date; display_name: string; kind: string; channel_name: string; total: string;
      }>(
        `SELECT a.id, a.name, a.channel_id, a.uploaded_by, a.uploaded_at,
                u.display_name, c.kind, c.name AS channel_name, count(*) OVER () AS total
         FROM attachments a
         JOIN users u ON u.id = a.uploaded_by
         JOIN channels c ON c.id = a.channel_id
         JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
         WHERE c.workspace_id = $3 AND a.name ILIKE $1
         ORDER BY a.uploaded_at DESC LIMIT $4`,
        [like, userId, workspaceId, limit],
      );

      if (rows.length > 0) {
        groups.push({
          kind: "file",
          label: GROUP_LABEL.file,
          total: Number(rows[0].total),
          results: rows.map<SearchResult>((row) => ({
            id: `sr_file_${row.id}`,
            kind: "file",
            title: row.name,
            snippet: `Shared by ${row.display_name}`,
            contextLabel: channelLabel(row.kind, row.channel_name),
            timestamp: row.uploaded_at.toISOString(),
            refId: row.id,
            channelId: row.channel_id,
            authorId: row.uploaded_by,
          })),
        });
      }
    }

    return groups;
  },
};
