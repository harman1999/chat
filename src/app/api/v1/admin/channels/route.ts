import { handler, json } from "@server/lib/http";
import { query } from "@server/db/client";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import type { Channel } from "@/types";

/** Every channel in the workspace, including ones the admin is not a member of. */
export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");

  const rows = await query<{
    id: string; kind: Channel["kind"]; name: string; purpose: string; description: string;
    topic: string | null; member_count: number; is_archived: boolean;
    last_message_at: Date | null; created_by: string | null; created_at: Date;
  }>(
    `SELECT id, kind, name, purpose, description, topic, member_count, is_archived,
            last_message_at, created_by, created_at
     FROM channels WHERE workspace_id = $1 AND kind IN ('public','private')
     ORDER BY name`,
    [workspaceId],
  );

  return json(
    rows.map<Channel>((row) => ({
      id: row.id,
      workspaceId: workspaceId,
      kind: row.kind,
      name: row.name,
      purpose: row.purpose,
      description: row.description,
      topic: row.topic,
      memberIds: [],
      memberCount: row.member_count,
      unreadCount: 0,
      mentionCount: 0,
      isMuted: false,
      isFavorite: false,
      isArchived: row.is_archived,
      lastMessageAt: row.last_message_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      createdBy: row.created_by ?? "",
    })),
  );
});
