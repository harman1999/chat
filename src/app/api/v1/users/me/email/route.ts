import { handler, json, parseBody, problem } from "@server/lib/http";
import { query, queryOne } from "@server/db/client";
import { audit } from "@server/lib/audit";
import { verifyPassword } from "@server/lib/password";
import { PASSWORD_RULE } from "@server/lib/rate-limit";
import { emailChangeSchema } from "@server/lib/schemas";
import { requireUserSession } from "@server/lib/session";

/**
 * Changes the caller's sign-in email, at once.
 *
 * There is no mail transport, so no confirmation link can be sent; the
 * current password stands in for it, proving the change is made by the
 * account holder and not by someone at an unlocked screen. Only this
 * workspace's account changes — accounts in other workspaces are separate.
 */
export const PUT = handler(async (request: Request) => {
  const { user, workspaceId } = await requireUserSession();
  const { email, password } = await parseBody(request, emailChangeSchema);

  const row = await queryOne<{ email: string; password_hash: string | null }>(
    `SELECT email, password_hash FROM users WHERE id = $1`,
    [user.id],
  );
  if (!row?.password_hash || !(await verifyPassword(password, row.password_hash))) {
    return problem(403, "invalid_credentials", "Your current password is incorrect");
  }
  if (row.email.toLowerCase() === email) {
    return problem(400, "invalid_request", "That is already your email address");
  }

  // Unique per workspace; checked in the same statement that writes, so two
  // people claiming one address at once cannot both succeed.
  const rows = await query<{ id: string }>(
    `UPDATE users SET email = $2 WHERE id = $1
       AND NOT EXISTS (SELECT 1 FROM users o WHERE o.workspace_id = $3
                        AND lower(o.email) = $2 AND o.id <> $1)
     RETURNING id`,
    [user.id, email, workspaceId],
  );
  if (rows.length === 0) {
    return problem(409, "email_taken", "Someone in this workspace already uses that email");
  }

  await audit({
    actorId: user.id,
    action: "auth.email_changed",
    category: "auth",
    severity: "warning",
    target: `${row.email} → ${email}`,
    request,
  });
  return json({ email });
}, { rateLimit: PASSWORD_RULE });
