import { handler, noContent, parseBody, problem } from "@server/lib/http";
import { PASSWORD_RULE } from "@server/lib/rate-limit";
import { query, queryOne } from "@server/db/client";
import { hashPassword, verifyPassword } from "@server/lib/password";
import { redis, sessionKey } from "@server/lib/redis";
import { passwordSchema } from "@server/lib/schemas";
import { audit } from "@server/lib/audit";
import { requireUserSession } from "@server/lib/session";

export const PUT = handler(async (request: Request) => {
  const { user, sessionId } = await requireUserSession();
  const body = await parseBody(request, passwordSchema);

  const row = await queryOne<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [user.id],
  );
  if (!row?.password_hash || !(await verifyPassword(body.currentPassword, row.password_hash))) {
    return problem(403, "invalid_credentials", "Current password is incorrect");
  }

  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
    user.id,
    await hashPassword(body.newPassword),
  ]);

  // Changing a password ends every other session.
  const revoked = await query<{ id: string }>(
    `DELETE FROM sessions WHERE user_id = $1 AND id <> $2 RETURNING id`,
    [user.id, sessionId],
  );
  if (revoked.length) await redis.del(...revoked.map((session) => sessionKey(session.id)));

  await audit({
    actorId: user.id,
    action: "auth.password_changed",
    category: "auth",
    severity: "warning",
    target: `${revoked.length} other sessions revoked`,
    request,
  });
  return noContent();
}, { rateLimit: PASSWORD_RULE });
