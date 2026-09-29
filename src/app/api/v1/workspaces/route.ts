import { handler, json } from "@server/lib/http";
import { query } from "@server/db/client";
import { requireSession } from "@server/lib/session";
import { logoUrlOf } from "@server/repo/workspaces";
import type { Workspace } from "@/types";

/**
 * The workspace the caller is in.
 *
 * There is one, and it is fixed: groups of people inside it are teams. This
 * still answers with a list because the menu and the top bar read a list, and
 * because a second workspace, provisioned by an operator, would not change the
 * client.
 */
export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();

  const rows = await query<{
    id: string; name: string; slug: string; initials: string;
    plan: Workspace["plan"]; logo_updated_at: Date | null; member_count: string;
    unread_count: string; mention_count: string;
  }>(
    `SELECT w.id, w.name, w.slug, w.initials, w.plan, w.logo_updated_at,
            (SELECT count(*) FROM users u WHERE u.workspace_id = w.id
               AND u.account_status = 'active' AND NOT u.is_bot) AS member_count,
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
      logoUrl: logoUrlOf(row.id, row.logo_updated_at),
      plan: row.plan,
      isCurrent: true,
      memberCount: Number(row.member_count),
      unreadCount: Number(row.unread_count),
      mentionCount: Number(row.mention_count),
    })),
  );
});
