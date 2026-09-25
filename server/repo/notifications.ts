import { randomUUID } from "node:crypto";
import { query } from "../db/client";
import type { AppNotification, NotificationKind } from "../../src/types";

interface NotificationRow {
  id: string;
  kind: NotificationKind;
  actor_id: string | null;
  channel_id: string | null;
  message_id: string | null;
  title: string;
  preview: string;
  is_read: boolean;
  created_at: Date;
}

export const notificationsRepo = {
  async list(userId: string): Promise<AppNotification[]> {
    const rows = await query<NotificationRow>(
      `SELECT id, kind, actor_id, channel_id, message_id, title, preview, is_read, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 60`,
      [userId],
    );

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      actorId: row.actor_id ?? "",
      channelId: row.channel_id,
      messageId: row.message_id,
      title: row.title,
      preview: row.preview,
      createdAt: row.created_at.toISOString(),
      isRead: row.is_read,
    }));
  },

  async markRead(id: string, userId: string): Promise<void> {
    await query(`UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`, [id, userId]);
  },

  async markAllRead(userId: string): Promise<void> {
    await query(`UPDATE notifications SET is_read = true WHERE user_id = $1 AND NOT is_read`, [userId]);
  },

  /**
   * Fans a new message out to everyone who should hear about it.
   *
   * Returns the recipient alongside each notification: `AppNotification` has no
   * user id of its own (the feed is always "mine"), so the caller would
   * otherwise have nobody to address the realtime event to.
   */
  async createForMessage(input: {
    kind: NotificationKind;
    userIds: string[];
    actorId: string;
    channelId: string;
    messageId: string;
    title: string;
    preview: string;
  }): Promise<{ userId: string; notification: AppNotification }[]> {
    const recipients = input.userIds.filter((id) => id !== input.actorId);
    if (recipients.length === 0) return [];

    const created: { userId: string; notification: AppNotification }[] = [];
    for (const userId of recipients) {
      const id = `nt_${randomUUID()}`;
      await query(
        `INSERT INTO notifications (id, user_id, kind, actor_id, channel_id, message_id, title, preview)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, userId, input.kind, input.actorId, input.channelId, input.messageId, input.title, input.preview],
      );
      created.push({
        userId,
        notification: {
          id,
          kind: input.kind,
          actorId: input.actorId,
          channelId: input.channelId,
          messageId: input.messageId,
          title: input.title,
          preview: input.preview,
          createdAt: new Date().toISOString(),
          isRead: false,
        },
      });
    }
    return created;
  },
};
