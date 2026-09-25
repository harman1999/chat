import { handler, json } from "@server/lib/http";
import { query } from "@server/db/client";
import { requireSession } from "@server/lib/session";
import type { Workspace } from "@/types";

/**
 * Workspaces the caller belongs to.
 *
 * The schema gives each user a single `workspace_id`, so this returns one entry
 * today. It exists as a list because the switcher is a list, and because
 * membership becoming many-to-many should not change the client.
 */
export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();

  const rows = await query<{
    id: string; name: string; slug: string; initials: string;
    plan: Workspace["plan"]; member_count: string;
    unread_count: string; mention_count: string;
  }>(
    `SELECT w.id, w.name, w.slug, w.initials, w.plan,
            (SELECT count(*) FROM users u WHERE u.workspace_id = w.id
               AND u.account_status = 'active') AS member_count,
            (SELECT count(*) FROM messages m
               JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $2
               WHERE m.created_at > cm.last_read_at AND m.author_id <> $2
                 AND m.thread_root_id IS NULL AND m.deleted_at IS NULL) AS unread_count,
            (SELECT count(*) FROM message_mentions mm
               JOIN messages m ON m.id = mm.message_id
               JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $2
               WHERE mm.user_id = $2 AND m.created_at > cm.last_read_at) AS mention_count
     FROM workspaces w WHERE w.id = $1`,
    [workspaceId, user.id],
  );

  return json(
    rows.map<Workspace>((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      initials: row.initials,
      plan: row.plan,
      memberCount: Number(row.member_count),
      unreadCount: Number(row.unread_count),
      mentionCount: Number(row.mention_count),
    })),
  );
});
