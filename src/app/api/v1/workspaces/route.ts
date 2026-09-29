import { handler, json, parseBody, problem } from "@server/lib/http";
import { query, queryOne } from "@server/db/client";
import { audit } from "@server/lib/audit";
import { verifyPassword } from "@server/lib/password";
import { requirePermission } from "@server/lib/permissions";
import { PASSWORD_RULE } from "@server/lib/rate-limit";
import { createWorkspaceSchema } from "@server/lib/schemas";
import { requireSession, requireUserSession, signInAs } from "@server/lib/session";
import { logoUrlOf, workspacesRepo } from "@server/repo/workspaces";
import type { Workspace } from "@/types";

/**
 * The workspaces the switcher lists: the one signed in to, and every other
 * workspace where an account with the same email exists.
 *
 * Those are separate accounts — each workspace has its own — so the others
 * carry no unread or mention counts (they belong to another account), and
 * switching to one asks for that account's password.
 */
export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();

  const rows = await query<{
    id: string; name: string; slug: string; initials: string;
    plan: Workspace["plan"]; logo_updated_at: Date | null; member_count: string;
  }>(
    `SELECT w.id, w.name, w.slug, w.initials, w.plan, w.logo_updated_at,
            (SELECT count(*) FROM users m WHERE m.workspace_id = w.id
               AND m.account_status = 'active' AND NOT m.is_bot) AS member_count
       FROM workspaces w
      WHERE w.id = $1
         OR w.id IN (SELECT u.workspace_id FROM users u
                      WHERE lower(u.email) = lower($2) AND NOT u.is_bot
                        AND u.account_status <> 'deactivated')
      ORDER BY (w.id = $1) DESC, w.name
      LIMIT 50`,
    [workspaceId, user.email],
  );

  const counts = await queryOne<{ unread_count: string; mention_count: string }>(
    `SELECT
       (SELECT count(*) FROM messages m
          JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $1
         WHERE m.created_at > cm.last_read_at AND m.author_id <> $1
           AND m.thread_root_id IS NULL AND m.deleted_at IS NULL) AS unread_count,
       (SELECT count(*) FROM message_mentions mm
          JOIN messages m ON m.id = mm.message_id
          JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $1
         WHERE mm.user_id = $1 AND m.created_at > cm.last_read_at) AS mention_count`,
    [user.id],
  );

  return json(
    rows.map<Workspace>((row) => {
      const isCurrent = row.id === workspaceId;
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        initials: row.initials,
        // Logos are served only to members, so only the current one's loads.
        logoUrl: isCurrent ? logoUrlOf(row.id, row.logo_updated_at) : null,
        plan: row.plan,
        isCurrent,
        memberCount: Number(row.member_count),
        unreadCount: isCurrent ? Number(counts?.unread_count ?? 0) : 0,
        mentionCount: isCurrent ? Number(counts?.mention_count ?? 0) : 0,
      };
    }),
  );
});

/**
 * Creates a workspace, makes the caller its owner, and signs them in to it.
 *
 * Only owners and administrators hold p_workspace_create. The caller's
 * password is asked for again: this makes a new account with the same
 * credentials, so a borrowed, unlocked laptop must not be enough.
 */
export const POST = handler(async (request: Request) => {
  const { user, sessionId, workspaceId } = await requireUserSession();
  await requirePermission(user.id, "p_workspace_create");
  const body = await parseBody(request, createWorkspaceSchema);

  const row = await queryOne<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [user.id],
  );
  if (!row?.password_hash || !(await verifyPassword(body.password, row.password_hash))) {
    return problem(403, "invalid_credentials", "That password is incorrect");
  }

  const created = await workspacesRepo.create({ name: body.name, creatorId: user.id });

  // Recorded in the workspace it was created from — where the creator's
  // administrators would look — and in the new one, as its first entry.
  await audit({
    actorId: user.id,
    action: "workspace.created",
    category: "system",
    severity: "warning",
    target: `${body.name} (${created.slug})`,
    request,
  });
  await audit({
    actorId: created.userId,
    action: "workspace.created",
    category: "system",
    severity: "info",
    target: `${body.name}, from ${workspaceId}`,
    request,
  });

  await signInAs(created.userId, request, sessionId);
  return json({ workspaceId: created.workspaceId, slug: created.slug }, { status: 201 });
}, { rateLimit: PASSWORD_RULE });
