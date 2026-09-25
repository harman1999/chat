import { config } from "dotenv";
import Redis from "ioredis";
import { applySchema } from "../../server/db/migrate";

/**
 * Runs once before the suite: loads .env.local and guarantees the schema exists.
 *
 * Tests run against the same Docker Postgres as development (`npm run db:up`)
 * rather than a throwaway database, so a failing test can be inspected
 * afterwards with psql.
 */
export default async function setup() {
  config({ path: ".env.local", quiet: true });

  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://helix:helix@localhost:5434/helix";
  process.env.DATABASE_URL = connectionString;

  await applySchema(connectionString);

  // Rate-limit buckets survive between runs; a suite that exercises the limiter
  // would otherwise poison the next run's sign-ins.
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6381");
  const keys = await redis.keys("ratelimit:*");
  if (keys.length) await redis.del(...keys);
  await redis.quit();
}
