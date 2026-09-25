/**
 * Seeds Postgres from the fixtures the frontend has been running against, so
 * the switch from mocks to the API is a like-for-like swap rather than a
 * different-looking workspace.
 *
 * Idempotent: every insert is ON CONFLICT DO UPDATE, so re-running refreshes
 * content without duplicating it.
 */
import {
  adminUsers,
  auditLog,
  channels,
  directMessages,
  messagesByChannel,
  notifications as notificationFixtures,
  permissions,
  repliesByRootId,
  roles,
  systemSettings,
  threads,
  users,
  workspaces,
} from "../../src/data";
import { defaultPreferences } from "../../src/config";
import { pool } from "./client";
import { hashPassword } from "../lib/password";
import type { Message } from "../../src/types";

const WORKSPACE_ID = "ws_northwind";
const DEMO_PASSWORD = "helix-demo-password";

async function main() {
  const client = await pool.connect();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  try {
    await client.query("BEGIN");

    for (const workspace of workspaces) {
      await client.query(
        `INSERT INTO workspaces (id, name, slug, initials, plan, settings)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, slug = EXCLUDED.slug,
               initials = EXCLUDED.initials, plan = EXCLUDED.plan,
               settings = EXCLUDED.settings`,
        [
          workspace.id,
          workspace.name,
          workspace.slug,
          workspace.initials,
          workspace.plan,
          JSON.stringify(workspace.id === WORKSPACE_ID ? systemSettings : {}),
        ],
      );
    }

    for (const role of roles) {
      await client.query(
        `INSERT INTO roles (id, workspace_id, name, description, is_system)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, description = EXCLUDED.description,
               is_system = EXCLUDED.is_system`,
        [role.id, WORKSPACE_ID, role.name, role.description, role.isSystem],
      );
    }

    for (const permission of permissions) {
      await client.query(
        `INSERT INTO permissions (id, grp, label, description)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE
           SET grp = EXCLUDED.grp, label = EXCLUDED.label,
               description = EXCLUDED.description`,
        [permission.id, permission.group, permission.label, permission.description],
      );
    }

    await client.query("DELETE FROM role_permissions");
    for (const role of roles) {
      for (const permissionId of role.permissionIds) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [role.id, permissionId],
        );
      }
    }

    // adminUsers is a superset of `users`, carrying account status and role ids.
    for (const user of adminUsers) {
      await client.query(
        `INSERT INTO users (
           id, workspace_id, username, display_name, full_name, email, password_hash,
           title, department, timezone, avatar_color, presence,
           status_emoji, status_text, status_expires_at,
           role, role_id, account_status, is_bot, two_factor_enabled,
           last_active_at, last_sign_in_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         ON CONFLICT (id) DO UPDATE SET
           display_name = EXCLUDED.display_name, full_name = EXCLUDED.full_name,
           email = EXCLUDED.email, title = EXCLUDED.title,
           department = EXCLUDED.department, presence = EXCLUDED.presence,
           status_emoji = EXCLUDED.status_emoji, status_text = EXCLUDED.status_text,
           role = EXCLUDED.role, role_id = EXCLUDED.role_id,
           account_status = EXCLUDED.account_status,
           two_factor_enabled = EXCLUDED.two_factor_enabled`,
        [
          user.id, WORKSPACE_ID, user.username, user.displayName, user.fullName,
          user.email, passwordHash, user.title, user.department, user.timezone,
          user.avatarColor, user.presence,
          user.customStatus?.emoji ?? null,
          user.customStatus?.text ?? null,
          user.customStatus?.expiresAt ?? null,
          user.role, user.roleId, user.status, user.isBot, user.twoFactorEnabled,
          user.lastActiveAt, user.lastSignInAt, user.createdAt,
        ],
      );
    }

    for (const user of users) {
      await client.query(
        `INSERT INTO user_preferences (user_id, preferences) VALUES ($1,$2)
         ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences`,
        [user.id, JSON.stringify(defaultPreferences)],
      );
    }

    for (const channel of [...channels, ...directMessages]) {
      await client.query(
        `INSERT INTO channels (
           id, workspace_id, kind, name, purpose, description, topic,
           member_count, is_archived, last_message_at, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, purpose = EXCLUDED.purpose,
           description = EXCLUDED.description, topic = EXCLUDED.topic,
           member_count = EXCLUDED.member_count,
           last_message_at = EXCLUDED.last_message_at`,
        [
          channel.id, WORKSPACE_ID, channel.kind, channel.name, channel.purpose,
          // The count is derived from the memberships actually inserted below —
          // the fixture's own memberCount is decorative and, for #general, claims
          // more members than the workspace has users.
          channel.description, channel.topic, channel.memberIds.length, channel.isArchived,
          channel.lastMessageAt, channel.createdBy, channel.createdAt,
        ],
      );

      for (const memberId of channel.memberIds) {
        await client.query(
          `INSERT INTO channel_members (channel_id, user_id, is_muted, is_favorite, last_read_at)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (channel_id, user_id) DO UPDATE
             SET is_muted = EXCLUDED.is_muted, is_favorite = EXCLUDED.is_favorite`,
          [channel.id, memberId, channel.isMuted, channel.isFavorite, channel.createdAt],
        );
      }
    }

    // Roots before replies: thread_root_id is a self-referencing foreign key.
    const roots: Message[] = Object.values(messagesByChannel).flat();
    const replies: Message[] = Object.values(repliesByRootId).flat();

    for (const message of [...roots, ...replies]) {
      await client.query(
        `INSERT INTO messages (
           id, channel_id, author_id, kind, body, thread_root_id,
           is_pinned, created_at, edited_at, deleted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           body = EXCLUDED.body, is_pinned = EXCLUDED.is_pinned,
           edited_at = EXCLUDED.edited_at`,
        [
          message.id, message.channelId, message.authorId, message.kind, message.body,
          message.threadRootId, message.isPinned, message.createdAt,
          message.editedAt, message.deletedAt,
        ],
      );

      for (const userId of message.mentionedUserIds) {
        await client.query(
          `INSERT INTO message_mentions (message_id, user_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          [message.id, userId],
        );
      }

      for (const reaction of message.reactions) {
        for (const userId of reaction.userIds) {
          await client.query(
            `INSERT INTO reactions (message_id, user_id, emoji, name) VALUES ($1,$2,$3,$4)
             ON CONFLICT DO NOTHING`,
            [message.id, userId, reaction.emoji, reaction.name],
          );
        }
      }

      for (const attachment of message.attachments) {
        await client.query(
          `INSERT INTO attachments (
             id, message_id, channel_id, uploaded_by, name, kind, mime_type,
             size_bytes, storage_key, width, height, uploaded_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
          [
            attachment.id, message.id, message.channelId, attachment.uploadedBy,
            attachment.name, attachment.kind, attachment.mimeType, attachment.sizeBytes,
            attachment.url, attachment.width ?? null, attachment.height ?? null,
            attachment.uploadedAt,
          ],
        );
      }

      if (message.isSaved) {
        await client.query(
          `INSERT INTO message_saves (user_id, message_id) VALUES ($1,$2)
           ON CONFLICT DO NOTHING`,
          ["u_harman", message.id],
        );
      }
    }

    for (const thread of threads) {
      await client.query(
        `INSERT INTO thread_follows (user_id, root_id, last_read_at) VALUES ($1,$2,now())
         ON CONFLICT (user_id, root_id) DO NOTHING`,
        ["u_harman", thread.rootId],
      );

      // Same idea as channel read cursors: position it so the API computes the
      // unread count the fixtures describe.
      await client.query(
        `UPDATE thread_follows tf
         SET last_read_at = COALESCE(
           (SELECT r.created_at FROM messages r
             WHERE r.thread_root_id = tf.root_id AND r.deleted_at IS NULL
               AND r.author_id <> 'u_harman'
             ORDER BY r.created_at DESC
             OFFSET $2 LIMIT 1),
           to_timestamp(0))
         WHERE tf.user_id = 'u_harman' AND tf.root_id = $1`,
        [thread.rootId, thread.unreadReplyCount],
      );
    }

    for (const notification of notificationFixtures) {
      await client.query(
        `INSERT INTO notifications (
           id, user_id, kind, actor_id, channel_id, message_id, title, preview, is_read, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET is_read = EXCLUDED.is_read`,
        [
          notification.id, "u_harman", notification.kind, notification.actorId,
          notification.channelId, notification.messageId, notification.title,
          notification.preview, notification.isRead, notification.createdAt,
        ],
      );
    }

    for (const entry of auditLog) {
      await client.query(
        `INSERT INTO audit_log (
           id, workspace_id, actor_id, action, category, severity, target, ip_address, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [
          entry.id, WORKSPACE_ID, entry.actorId, entry.action, entry.category,
          entry.severity, entry.target, entry.ipAddress, entry.createdAt,
        ],
      );
    }

    // Read cursors: place the signed-in user's cursor so the unread counts the
    // fixtures describe are what the API actually computes. Everyone else is
    // marked fully caught up.
    await client.query(
      `UPDATE channel_members SET last_read_at = now() WHERE user_id <> 'u_harman'`,
    );

    for (const channel of [...channels, ...directMessages]) {
      const unread = channel.unreadCount;
      await client.query(
        `UPDATE channel_members cm
         SET last_read_at = COALESCE(
           (SELECT m.created_at FROM messages m
             WHERE m.channel_id = cm.channel_id AND m.thread_root_id IS NULL
               AND m.deleted_at IS NULL AND m.author_id <> 'u_harman'
             ORDER BY m.created_at DESC
             OFFSET $2 LIMIT 1),
           to_timestamp(0))
         WHERE cm.channel_id = $1 AND cm.user_id = 'u_harman'`,
        [channel.id, unread],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const counts = await pool.query<{ table_name: string; n: string }>(`
    SELECT 'users' AS table_name, count(*)::text AS n FROM users
    UNION ALL SELECT 'channels', count(*)::text FROM channels
    UNION ALL SELECT 'channel_members', count(*)::text FROM channel_members
    UNION ALL SELECT 'messages', count(*)::text FROM messages
    UNION ALL SELECT 'reactions', count(*)::text FROM reactions
    UNION ALL SELECT 'attachments', count(*)::text FROM attachments
    UNION ALL SELECT 'mentions', count(*)::text FROM message_mentions
    UNION ALL SELECT 'notifications', count(*)::text FROM notifications
    UNION ALL SELECT 'audit_log', count(*)::text FROM audit_log
    ORDER BY 1
  `);

  console.log(`Seeded workspace ${WORKSPACE_ID}. Demo password: ${DEMO_PASSWORD}`);
  console.table(counts.rows);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
