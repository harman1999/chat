import { randomUUID } from "node:crypto";
import { query, queryOne, transaction } from "../db/client";
import type { Attachment, Message, MessageKind, Paginated } from "../../src/types";

export const MESSAGE_PAGE_SIZE = 40;

/** Threads are usually short, but a hot one must not return thousands of rows. */
export const REPLY_PAGE_SIZE = 50;

interface MessageRow {
  id: string;
  channel_id: string;
  author_id: string;
  kind: MessageKind;
  body: string;
  thread_root_id: string | null;
  is_pinned: boolean;
  created_at: Date;
  edited_at: Date | null;
  deleted_at: Date | null;
  reactions: { emoji: string; name: string; user_ids: string[] }[] | null;
  attachments: Record<string, unknown>[] | null;
  mention_ids: string[] | null;
  reply_count: string | null;
  reply_participant_ids: string[] | null;
  last_reply_at: Date | null;
  is_saved: boolean | null;
}

/**
 * Reactions, attachments and thread summaries are aggregated in the query
 * rather than fetched per message — a 40-message page must be one round trip.
 */
const MESSAGE_SELECT = `
  SELECT m.id, m.channel_id, m.author_id, m.kind, m.body, m.thread_root_id,
         m.is_pinned, m.created_at, m.edited_at, m.deleted_at,
         (SELECT jsonb_agg(r ORDER BY r.first_at)
            FROM (SELECT emoji, name, array_agg(user_id ORDER BY created_at) AS user_ids,
                         min(created_at) AS first_at
                  FROM reactions WHERE message_id = m.id
                  GROUP BY emoji, name) r) AS reactions,
         (SELECT jsonb_agg(jsonb_build_object(
                   'id', a.id, 'name', a.name, 'kind', a.kind, 'mimeType', a.mime_type,
                   'sizeBytes', a.size_bytes,
                   -- Seeded fixtures point at /public; real uploads stream
                   -- through the authenticated file endpoint.
                   'url', CASE WHEN a.storage_key LIKE '/%'
                               THEN a.storage_key
                               ELSE '/api/v1/files/' || a.id || '/content' END,
                   'thumbnailUrl', CASE WHEN a.kind = 'image' AND a.storage_key LIKE '/%'
                                        THEN a.storage_key
                                        WHEN a.kind = 'image'
                                        THEN '/api/v1/files/' || a.id || '/content'
                                        ELSE NULL END,
                   'width', a.width, 'height', a.height,
                   'uploadedAt', a.uploaded_at, 'uploadedBy', a.uploaded_by) ORDER BY a.uploaded_at)
            FROM attachments a WHERE a.message_id = m.id) AS attachments,
         (SELECT array_agg(user_id) FROM message_mentions WHERE message_id = m.id) AS mention_ids,
         (SELECT count(*) FROM messages r WHERE r.thread_root_id = m.id AND r.deleted_at IS NULL) AS reply_count,
         (SELECT array_agg(DISTINCT r.author_id) FROM messages r WHERE r.thread_root_id = m.id) AS reply_participant_ids,
         (SELECT max(r.created_at) FROM messages r WHERE r.thread_root_id = m.id) AS last_reply_at,
         (SELECT true FROM message_saves ms WHERE ms.message_id = m.id AND ms.user_id = $1) AS is_saved
  FROM messages m
`;

export function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    authorId: row.author_id,
    kind: row.kind,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at?.toISOString() ?? null,
    deletedAt: row.deleted_at?.toISOString() ?? null,
    reactions: (row.reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji,
      name: reaction.name,
      userIds: reaction.user_ids,
      count: reaction.user_ids.length,
    })),
    attachments: (row.attachments ?? []) as unknown as Attachment[],
    mentionedUserIds: row.mention_ids ?? [],
    threadRootId: row.thread_root_id,
    replyCount: Number(row.reply_count ?? 0),
    replyParticipantIds: row.reply_participant_ids ?? [],
    lastReplyAt: row.last_reply_at?.toISOString() ?? null,
    isPinned: row.is_pinned,
    isSaved: Boolean(row.is_saved),
    deliveryState: "sent",
  };
}

export const messagesRepo = {
  /** Pages backwards from newest; `cursor` is the oldest id already loaded. */
  async list(channelId: string, userId: string, cursor?: string | null): Promise<Paginated<Message>> {
    const rows = await query<MessageRow>(
      `${MESSAGE_SELECT}
       WHERE m.channel_id = $2 AND m.thread_root_id IS NULL AND m.deleted_at IS NULL
         AND ($3::text IS NULL OR m.created_at < (SELECT created_at FROM messages WHERE id = $3))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ${MESSAGE_PAGE_SIZE + 1}`,
      [userId, channelId, cursor ?? null],
    );

    const hasMore = rows.length > MESSAGE_PAGE_SIZE;
    const page = rows.slice(0, MESSAGE_PAGE_SIZE).reverse();

    return {
      items: page.map(mapMessage),
      nextCursor: hasMore ? page[0]?.id ?? null : null,
      hasMore,
    };
  },

  async get(id: string, userId: string): Promise<Message | null> {
    const row = await queryOne<MessageRow>(`${MESSAGE_SELECT} WHERE m.id = $2`, [userId, id]);
    return row ? mapMessage(row) : null;
  },

  /** Batched `get`, so callers with a list of ids issue one query, not N. */
  async getMany(ids: string[], userId: string): Promise<Map<string, Message>> {
    if (ids.length === 0) return new Map();
    const rows = await query<MessageRow>(`${MESSAGE_SELECT} WHERE m.id = ANY($2::text[])`, [
      userId,
      ids,
    ]);
    return new Map(rows.map((row) => [row.id, mapMessage(row)]));
  },

  /**
   * Replies oldest-first, paged forward. A thread reads top to bottom, so
   * unlike the channel list this pages *forward* from the cursor.
   */
  async listReplies(
    rootId: string,
    userId: string,
    cursor?: string | null,
  ): Promise<Paginated<Message>> {
    const rows = await query<MessageRow>(
      `${MESSAGE_SELECT}
       WHERE m.thread_root_id = $2 AND m.deleted_at IS NULL
         AND ($3::text IS NULL OR m.created_at > (SELECT created_at FROM messages WHERE id = $3))
       ORDER BY m.created_at, m.id
       LIMIT ${REPLY_PAGE_SIZE + 1}`,
      [userId, rootId, cursor ?? null],
    );

    const hasMore = rows.length > REPLY_PAGE_SIZE;
    const page = rows.slice(0, REPLY_PAGE_SIZE);

    return {
      items: page.map(mapMessage),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
      hasMore,
    };
  },

  async listMentions(userId: string, limit = 100): Promise<Message[]> {
    const rows = await query<MessageRow>(
      `${MESSAGE_SELECT}
       JOIN message_mentions mm ON mm.message_id = m.id AND mm.user_id = $1
       WHERE m.deleted_at IS NULL
       ORDER BY m.created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map(mapMessage);
  },

  async listSaved(userId: string, limit = 100): Promise<Message[]> {
    const rows = await query<MessageRow>(
      `${MESSAGE_SELECT}
       JOIN message_saves ms ON ms.message_id = m.id AND ms.user_id = $1
       WHERE m.deleted_at IS NULL
       ORDER BY m.created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map(mapMessage);
  },

  async create(input: {
    channelId: string;
    authorId: string;
    body: string;
    threadRootId?: string | null;
    attachmentIds?: string[];
    mentionedUsernames?: string[];
  }): Promise<Message> {
    const id = `m_${randomUUID()}`;

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO messages (id, channel_id, author_id, kind, body, thread_root_id)
         VALUES ($1,$2,$3,'text',$4,$5)`,
        [id, input.channelId, input.authorId, input.body, input.threadRootId ?? null],
      );

      // Mentions are resolved server-side: the client sends text, never ids it
      // could forge.
      await client.query(
        `INSERT INTO message_mentions (message_id, user_id)
         SELECT $1, u.id FROM users u
         WHERE u.username = ANY($2::text[])
         ON CONFLICT DO NOTHING`,
        [id, input.mentionedUsernames ?? []],
      );

      if (input.attachmentIds?.length) {
        await client.query(
          `UPDATE attachments SET message_id = $1, channel_id = $2 WHERE id = ANY($3::text[])`,
          [id, input.channelId, input.attachmentIds],
        );
      }

      await client.query(`UPDATE channels SET last_message_at = now() WHERE id = $1`, [
        input.channelId,
      ]);
      await client.query(
        `UPDATE channel_members SET last_read_at = now() WHERE channel_id = $1 AND user_id = $2`,
        [input.channelId, input.authorId],
      );
    });

    const message = await messagesRepo.get(id, input.authorId);
    if (!message) throw new Error("Message vanished after insert");
    return message;
  },

  async update(id: string, authorId: string, body: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE messages SET body = $3, edited_at = now()
       WHERE id = $1 AND author_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, authorId, body],
    );
    return rows.length > 0;
  },

  /** Soft delete: threads and audit history must survive the message. */
  async remove(id: string, authorId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE messages SET deleted_at = now(), body = ''
       WHERE id = $1 AND author_id = $2 RETURNING id`,
      [id, authorId],
    );
    return rows.length > 0;
  },

  async addReaction(id: string, userId: string, emoji: string, name: string): Promise<void> {
    await query(
      `INSERT INTO reactions (message_id, user_id, emoji, name) VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [id, userId, emoji, name],
    );
  },

  async removeReaction(id: string, userId: string, emoji: string): Promise<void> {
    await query(`DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`, [
      id,
      userId,
      emoji,
    ]);
  },

  async setPinned(id: string, isPinned: boolean): Promise<void> {
    await query(`UPDATE messages SET is_pinned = $2 WHERE id = $1`, [id, isPinned]);
  },

  async setSaved(id: string, userId: string, isSaved: boolean): Promise<void> {
    if (isSaved) {
      await query(
        `INSERT INTO message_saves (user_id, message_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [userId, id],
      );
    } else {
      await query(`DELETE FROM message_saves WHERE user_id = $1 AND message_id = $2`, [userId, id]);
    }
  },

  async channelOf(id: string): Promise<string | null> {
    const row = await queryOne<{ channel_id: string }>(
      `SELECT channel_id FROM messages WHERE id = $1`,
      [id],
    );
    return row?.channel_id ?? null;
  },
};
