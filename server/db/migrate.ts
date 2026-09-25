/**
 * Migration runner.
 *
 * Numbered SQL files applied in order, each inside a transaction, recorded in a
 * journal so re-running is a no-op. Replaces the previous approach of
 * re-applying one idempotent `CREATE TABLE IF NOT EXISTS` file, which could not
 * express an `ALTER` and had no way to know what had already run.
 *
 * Works anywhere `DATABASE_URL` resolves — no Docker in the path, so CI and
 * production use the same command as a laptop.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pool } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");

const JOURNAL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     text PRIMARY KEY,
    name        text        NOT NULL,
    checksum    text        NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )
`;

export interface Migration {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export async function loadMigrations(): Promise<Migration[]> {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  return Promise.all(
    files.map(async (file) => {
      const sql = await readFile(join(migrationsDir, file), "utf8");
      const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
      return {
        version,
        name: rest.join("_") || file,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex").slice(0, 16),
      };
    }),
  );
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export async function migrate(connectionString: string): Promise<MigrateResult> {
  const pool = new Pool({ connectionString, max: 1 });
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await pool.query(JOURNAL);
    const { rows } = await pool.query<{ version: string; checksum: string; name: string }>(
      `SELECT version, checksum, name FROM schema_migrations`,
    );
    const journal = new Map(rows.map((row) => [row.version, row]));

    for (const migration of await loadMigrations()) {
      const record = journal.get(migration.version);

      if (record) {
        // An edited migration means the database and the repository disagree
        // about what was applied — fail loudly rather than drift.
        if (record.checksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.version}_${migration.name} changed after it was applied ` +
              `(recorded ${record.checksum}, found ${migration.checksum}). ` +
              `Add a new migration instead of editing an applied one.`,
          );
        }
        skipped.push(migration.version);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum) VALUES ($1,$2,$3)`,
          [migration.version, migration.name, migration.checksum],
        );
        await client.query("COMMIT");
        applied.push(migration.version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(
          `Migration ${migration.version}_${migration.name} failed: ${(error as Error).message}`,
        );
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }

  return { applied, skipped };
}

/** Back-compat for the test harness, which only needs a usable schema. */
export async function applySchema(connectionString: string): Promise<void> {
  await migrate(connectionString);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://helix:helix@localhost:5434/helix";

  migrate(connectionString)
    .then(({ applied, skipped }) => {
      const target = connectionString.replace(/:[^:@]*@/, ":***@");
      if (applied.length === 0) {
        console.log(`Schema up to date (${skipped.length} migrations) — ${target}`);
      } else {
        console.log(`Applied ${applied.join(", ")} (${skipped.length} already present) — ${target}`);
      }
    })
    .catch((error) => {
      console.error(error.message ?? error);
      process.exit(1);
    });
}
