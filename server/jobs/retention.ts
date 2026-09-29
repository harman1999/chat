import { randomUUID } from "node:crypto";
import { query, queryOne } from "../db/client";
import { redis } from "../lib/redis";
import { storage } from "../lib/storage";

/** Rows removed per statement, so no single delete holds locks for long. */
const BATCH = 500;
/** Per workspace per run: a large backlog is worked off over several runs. */
const MAX_BATCHES = 20;

export interface PurgeResult {
  messages: number;
  files: number;
}

/**
 * The cut-off for a retention setting, or null if it means "keep forever".
 *
 * Null, 0 and anything under a day all mean keep. Deleting is permanent, so an
 * unset, zero or garbled value must never be read as "delete everything".
 */
export function cutoffFor(days: unknown, now = new Date()): Date | null {
  if (typeof days !== "number" || !Number.isFinite(days) || days < 1) return null;
  return new Date(now.getTime() - days * 86_400_000);
}

/**
 * Permanently deletes a workspace's messages older than `cutoff`, with what
 * hangs off them (reactions, mentions, saves, notifications and attachments —
 * all cascade), and the attachment files from storage.
 *
 * A thread's first message is kept while any reply is still inside the window:
 * deleting it would cascade to those replies and remove messages that are not
 * old enough to go.
 */
export async function purgeMessages(workspaceId: string, cutoff: Date): Promise<PurgeResult> {
  const total: PurgeResult = { messages: 0, files: 0 };

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const due = await query<{ id: string }>(
      `SELECT m.id FROM messages m
         JOIN channels c ON c.id = m.channel_id
        WHERE c.workspace_id = $1 AND m.created_at < $2
          AND NOT EXISTS (
            SELECT 1 FROM messages r WHERE r.thread_root_id = m.id AND r.created_at >= $2)
        ORDER BY m.created_at
        LIMIT $3`,
      [workspaceId, cutoff, BATCH],
    );
    if (due.length === 0) break;
    const ids = due.map((row) => row.id);

    // Keys first: the rows that hold them go with the messages.
    const files = await query<{ storage_key: string }>(
      `SELECT storage_key FROM attachments WHERE message_id = ANY($1::text[])`,
      [ids],
    );
    const deleted = await query<{ id: string }>(
      `DELETE FROM messages WHERE id = ANY($1::text[]) RETURNING id`,
      [ids],
    );
    // After the rows, so a failure here leaves a stray file rather than a
    // message pointing at a file that is gone.
    await Promise.all(files.map((file) => storage.remove(file.storage_key)));

    total.messages += deleted.length;
    total.files += files.length;
    if (due.length < BATCH) break;
  }
  return total;
}

/**
 * One pass over every workspace that has a message retention set, or only
 * `onlyWorkspaceIds` — which tests use, because they share a database with a
 * real workspace and this deletes for good.
 */
export async function runRetention(
  now = new Date(),
  onlyWorkspaceIds?: string[],
): Promise<Record<string, PurgeResult>> {
  const workspaces = await query<{ id: string; days: string | null }>(
    `SELECT id, settings->>'messageRetentionDays' AS days FROM workspaces
      WHERE $1::text[] IS NULL OR id = ANY($1::text[])`,
    [onlyWorkspaceIds ?? null],
  );
  const results: Record<string, PurgeResult> = {};

  for (const workspace of workspaces) {
    const days = workspace.days === null ? null : Number(workspace.days);
    const cutoff = cutoffFor(days, now);
    if (!cutoff) continue;

    const result = await purgeMessages(workspace.id, cutoff);
    results[workspace.id] = result;
    if (result.messages === 0) continue;

    // No actor: the system did this, on the workspace's own setting. The trail
    // is the only record of a deletion that cannot be undone.
    await query(
      `INSERT INTO audit_log (id, workspace_id, actor_id, action, category, severity, target)
       VALUES ($1,$2,NULL,'retention.purged','system','warning',$3)`,
      [
        `audit_${randomUUID()}`,
        workspace.id,
        `${result.messages} messages and ${result.files} files older than ${days} days`,
      ],
    );
  }
  return results;
}

/** How many messages a retention of `days` would delete right now. */
export async function countDue(workspaceId: string, days: number, now = new Date()): Promise<number> {
  const cutoff = cutoffFor(days, now);
  if (!cutoff) return 0;
  const row = await queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM messages m
       JOIN channels c ON c.id = m.channel_id
      WHERE c.workspace_id = $1 AND m.created_at < $2
        AND NOT EXISTS (
          SELECT 1 FROM messages r WHERE r.thread_root_id = m.id AND r.created_at >= $2)`,
    [workspaceId, cutoff],
  );
  return Number(row?.n ?? 0);
}

const LOCK_KEY = "helix:jobs:retention";
const INTERVAL_MS = 60 * 60_000;

/**
 * Runs retention now and then hourly, for as long as the process lives.
 *
 * The lock lets several gateway processes run this safely: only the one that
 * takes it does the work, and it expires on its own if that process dies.
 */
export function startRetentionJob(): () => void {
  const tick = async () => {
    try {
      const locked = await redis.set(LOCK_KEY, "1", "EX", 30 * 60, "NX");
      if (!locked) return;
      const results = await runRetention();
      const messages = Object.values(results).reduce((sum, r) => sum + r.messages, 0);
      if (messages > 0) console.log(`[jobs] retention removed ${messages} messages`);
    } catch (error) {
      console.error("[jobs] retention failed", error);
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
