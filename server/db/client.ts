import { Pool, type QueryResultRow } from "pg";
import { env } from "../env";

/**
 * One pool per process. Next.js hot-reloads modules in development, so the pool
 * is cached on globalThis to avoid leaking a connection pool on every edit.
 */
const globalForPool = globalThis as unknown as { helixPool?: Pool };

export const pool =
  globalForPool.helixPool ??
  new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") globalForPool.helixPool = pool;

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
