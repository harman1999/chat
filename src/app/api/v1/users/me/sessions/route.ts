import { handler, json, noContent } from "@server/lib/http";
import { query } from "@server/db/client";
import { redis, sessionKey } from "@server/lib/redis";
import { requireUserSession } from "@server/lib/session";
import { usersRepo } from "@server/repo/users";

export const GET = handler(async () => {
  const { user, sessionId } = await requireUserSession();
  return json(await usersRepo.listSessions(user.id, sessionId));
});

/** Signs out every device except the one making the request. */
export const DELETE = handler(async () => {
  const { user, sessionId } = await requireUserSession();
  const rows = await query<{ id: string }>(
    `DELETE FROM sessions WHERE user_id = $1 AND id <> $2 RETURNING id`,
    [user.id, sessionId],
  );
  if (rows.length) await redis.del(...rows.map((row) => sessionKey(row.id)));
  return noContent();
});
