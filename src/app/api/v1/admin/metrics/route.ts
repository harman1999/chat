import { handler, json } from "@server/lib/http";
import { queryOne } from "@server/db/client";
import { snapshot } from "@server/lib/metrics";
import { requirePermission } from "@server/lib/permissions";
import { redis } from "@server/lib/redis";
import { requireSession } from "@server/lib/session";

/**
 * Operational counters for this process, plus the two facts they are most
 * often read against: whether Redis is actually reachable right now, and when
 * the audit trail was last appended to.
 */
export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");

  const [redisReachable, lastAudit] = await Promise.all([
    redis
      .ping()
      .then(() => true)
      .catch(() => false),
    queryOne<{ created_at: Date }>(
      `SELECT created_at FROM audit_log WHERE workspace_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [workspaceId],
    ),
  ]);

  const metrics = snapshot();
  const degraded = metrics.counters
    .filter((counter) => counter.name === "ratelimit.degraded")
    .reduce((total, counter) => total + counter.count, 0);

  return json({
    ...metrics,
    redisReachable,
    // The counters are per-process; this one is not, so it stays true across a
    // restart — which is when a gap in the trail is easiest to miss.
    lastAuditAt: lastAudit?.created_at.toISOString() ?? null,
    // Stated outright rather than left to be inferred from a counter name.
    rateLimitingEffective: redisReachable && degraded === 0,
  });
});
