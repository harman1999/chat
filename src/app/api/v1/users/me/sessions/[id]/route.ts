import { handler, noContent, problem } from "@server/lib/http";
import { query } from "@server/db/client";
import { redis, sessionKey } from "@server/lib/redis";
import { requireUserSession } from "@server/lib/session";

export const DELETE = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, sessionId } = await requireUserSession();
  const { id } = await ctx.params;
  if (id === sessionId) {
    return problem(400, "invalid_request", "Use sign out to end the current session");
  }

  await query(`DELETE FROM sessions WHERE id = $1 AND user_id = $2`, [id, user.id]);
  await redis.del(sessionKey(id));
  return noContent();
});
