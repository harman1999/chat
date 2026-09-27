import { Pool, type QueryResultRow } from "pg";
import { env } from "../env";
import { log } from "../lib/log";

/**
 * One pool per process. Next.js hot-reloads modules in development, so the pool
 * is cached on globalThis to avoid leaking a connection pool on every edit.
 */
const globalForPool = globalThis as unknown as { helixPool?: Pool };

/**
 * Built on first use, not on import.
 *
 * `next build` imports every route module with none of the runtime environment
 * present, so constructing the pool at module scope both failed the build and
 * would have opened connections during it.
 */
function createPool(): Pool {
  if (globalForPool.helixPool) return globalForPool.helixPool;

  const created = new Pool({
    connectionString: env.databaseUrl,
    // Sized per process, and every instance has its own pool: the ceiling that
    // matters is `max × instances` against the server's own connection limit.
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Without this one slow query holds a connection indefinitely, and enough
    // of them exhaust the pool while the database itself looks healthy.
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15_000),
    query_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 15_000),
    // Names the connection in pg_stat_activity, so a misbehaving query can be
    // attributed to this service rather than guessed at.
    application_name: process.env.APP_NAME ?? "helix",
  });

  // An idle client erroring (a network blip, a server restart) emits on the
  // pool. Unhandled, that is an uncaught exception which takes the process out.
  created.on("error", (error) => {
    log.error("idle pg client error", { error });
  });

  if (process.env.NODE_ENV !== "production") globalForPool.helixPool = created;
  return created;
}

let instance: Pool | undefined;

export const pool = new Proxy({} as Pool, {
  get(_target, property, receiver) {
    instance ??= createPool();
    const value = Reflect.get(instance, property, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/** Returns the first row, or null — the common shape for lookups by id. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs `fn` inside a transaction, rolling back on any thrown error. */
export async function transaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
