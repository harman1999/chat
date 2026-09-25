import { query, queryOne } from "../db/client";
import type { Message, Thread } from "../../src/types";
import { channelsRepo } from "./channels";
import { messagesRepo } from "./messages";

interface ThreadRow {
  root_id: string;
  channel_id: string;
  reply_count: string;
  participant_ids: string[] | null;
  last_reply_at: Date | null;
  last_read_at: Date;
  unread_reply_count: string;
}

function mapThread(row: ThreadRow): Thread {
  return {
    rootId: row.root_id,
    channelId: row.channel_id,
    replyCount: Number(row.reply_count),
    participantIds: row.participant_ids ?? [],
    lastReplyAt: row.last_reply_at?.toISOString() ?? null,
    isFollowing: true,
    unreadReplyCount: Number(row.unread_reply_count),
  };
}

const THREAD_SELECT = `
  SELECT tf.root_id, root.channel_id,
         (SELECT count(*) FROM messages r WHERE r.thread_root_id = tf.root_id AND r.deleted_at IS NULL) AS reply_count,
         (SELECT array_agg(DISTINCT r.author_id) FROM messages r WHERE r.thread_root_id = tf.root_id) AS participant_ids,
         (SELECT max(r.created_at) FROM messages r WHERE r.thread_root_id = tf.root_id) AS last_reply_at,
         tf.last_read_at,
         (SELECT count(*) FROM messages r
            WHERE r.thread_root_id = tf.root_id AND r.deleted_at IS NULL
              AND r.created_at > tf.last_read_at AND r.author_id <> tf.user_id) AS unread_reply_count
  FROM thread_follows tf
  JOIN messages root ON root.id = tf.root_id
`;

export const threadsRepo = {
  async listFollowed(userId: string, limit = 200): Promise<Thread[]> {
    const rows = await query<ThreadRow>(
      `${THREAD_SELECT} WHERE tf.user_id = $1
       ORDER BY last_reply_at DESC NULLS LAST
       LIMIT $2`,
      [userId, limit],
    );
    return rows.map(mapThread);
  },

  async get(rootId: string, userId: string): Promise<Thread | null> {
    const row = await queryOne<ThreadRow>(
      `${THREAD_SELECT} WHERE tf.user_id = $1 AND tf.root_id = $2`,
      [userId, rootId],
    );
    if (row) return mapThread(row);

    // Not followed: report the thread's shape with following = false.
    const root = await messagesRepo.get(rootId, userId);
    if (!root) return null;
    return {
      rootId,
      channelId: root.channelId,
      replyCount: root.replyCount,
      participantIds: root.replyParticipantIds,
      lastReplyAt: root.lastReplyAt,
      isFollowing: false,
      unreadReplyCount: 0,
    };
  },

  /**
   * The Threads inbox in one round trip: thread, root, a two-reply preview and
   * the channel, assembled here rather than by the client.
   */
  /**
   * The Threads inbox in a constant number of queries.
   *
   * Previously this resolved the root message and channel inside the loop — two
   * queries per followed thread. Everything is now batched, matching how the
   * reply previews were already fetched.
   */
  async inbox(userId: string, workspaceId: string) {
    const threads = await threadsRepo.listFollowed(userId);
    if (threads.length === 0) return [];

    const rootIds = threads.map((thread) => thread.rootId);
    const channelIds = [...new Set(threads.map((thread) => thread.channelId))];

    const [roots, channels, previewRows] = await Promise.all([
      messagesRepo.getMany(rootIds, userId),
      channelsRepo.getMany(channelIds, userId, workspaceId),
      query<{ thread_root_id: string } & Record<string, unknown>>(
        `SELECT * FROM (
           SELECT m.id, m.thread_root_id, m.author_id, m.body, m.created_at,
                  row_number() OVER (PARTITION BY m.thread_root_id ORDER BY m.created_at DESC) AS rn
           FROM messages m
           WHERE m.thread_root_id = ANY($1::text[]) AND m.deleted_at IS NULL
         ) ranked WHERE rn <= 2 ORDER BY created_at`,
        [rootIds],
      ),
    ]);

    // Group previews once rather than filtering the whole list per thread.
    const previewsByRoot = new Map<string, Message[]>();
    for (const row of previewRows) {
      const list = previewsByRoot.get(row.thread_root_id) ?? [];
      list.push({
        id: row.id as string,
        channelId: (row.channel_id as string) ?? "",
        authorId: row.author_id as string,
        kind: "text",
        body: row.body as string,
        createdAt: (row.created_at as Date).toISOString(),
        editedAt: null,
        deletedAt: null,
        reactions: [],
        attachments: [],
        mentionedUserIds: [],
        threadRootId: row.thread_root_id,
        replyCount: 0,
        replyParticipantIds: [],
        lastReplyAt: null,
        isPinned: false,
        isSaved: false,
        deliveryState: "sent",
      });
      previewsByRoot.set(row.thread_root_id, list);
    }

    const entries = [];
    for (const thread of threads) {
      const root = roots.get(thread.rootId);
      const channel = channels.get(thread.channelId);
      // A thread whose root or channel is gone is simply not shown.
      if (!root || !channel) continue;

      entries.push({
        thread,
        root,
        recentReplies: (previewsByRoot.get(thread.rootId) ?? []).map((reply) => ({
          ...reply,
          channelId: thread.channelId,
        })),
        channel,
      });
    }

    return entries;
  },

  async setFollowing(rootId: string, userId: string, isFollowing: boolean): Promise<void> {
    if (isFollowing) {
      await query(
        `INSERT INTO thread_follows (user_id, root_id, last_read_at) VALUES ($1,$2,now())
         ON CONFLICT DO NOTHING`,
        [userId, rootId],
      );
    } else {
      await query(`DELETE FROM thread_follows WHERE user_id = $1 AND root_id = $2`, [userId, rootId]);
    }
  },

  async markRead(rootId: string, userId: string): Promise<void> {
    await query(
      `UPDATE thread_follows SET last_read_at = now() WHERE user_id = $1 AND root_id = $2`,
      [userId, rootId],
    );
  },

  /** Replying implicitly follows the thread, matching how people expect it to work. */
  async ensureFollowing(rootId: string, userId: string): Promise<void> {
    await query(
      `INSERT INTO thread_follows (user_id, root_id, last_read_at) VALUES ($1,$2,now())
       ON CONFLICT (user_id, root_id) DO UPDATE SET last_read_at = now()`,
      [userId, rootId],
    );
  },
};
