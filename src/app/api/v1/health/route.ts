import { handler, json } from "@server/lib/http";
import { queryOne } from "@server/db/client";
import { redis } from "@server/lib/redis";

/**
 * Liveness and readiness for a load balancer or orchestrator.
 *
 * Unauthenticated by necessity — a probe has no session — so it reports only
 * whether dependencies answer, never what is in them.
 *
 * `?ready=1` additionally checks Postgres and Redis and fails the request when
 * either is down, which is what a readiness probe needs: a process that is
 * alive but cannot reach its database should be taken out of rotation, not
 * restarted.
 */
export const GET = handler(
  async (request: Request) => {
    const wantsReadiness = new URL(request.url).searchParams.has("ready");

    if (!wantsReadiness) {
      // Liveness: the process is up and serving. Deliberately touches nothing
      // else — a liveness probe that depends on the database restarts healthy
      // processes during a database blip.
      return json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
    }

    const [database, cache] = await Promise.all([
      queryOne<{ ok: number }>("SELECT 1 AS ok")
        .then(() => true)
        .catch(() => false),
      redis
        .ping()
        .then(() => true)
        .catch(() => false),
    ]);

    const ready = database && cache;
    return json(
      { status: ready ? "ready" : "degraded", database, cache },
      { status: ready ? 200 : 503 },
    );
  },
  // A probe runs every few seconds per instance; the default bucket would
  // reject it and take the instance out of rotation for being healthy.
  { rateLimit: false },
);
