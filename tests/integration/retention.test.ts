import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cutoffFor, countDue, purgeMessages, runRetention } from "@server/jobs/retention";
import { redis } from "@server/lib/redis";
import { storage } from "@server/lib/storage";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

/**
 * Retention deletes for good, and these tests share a database with a real
 * workspace. So everything here happens in throwaway workspaces, and the job is
 * only ever pointed at them by id — never at the whole database.
 */
describe("message retention", () => {
  const tag = randomUUID().slice(0, 8);
  const workspaces = [`ws_ret_${tag}`, `ws_ret_other_${tag}`];
  const [ws, other] = workspaces;
  const user = `u_ret_${tag}`;
  const otherUser = `u_ret_other_${tag}`;
  const channel = `ch_ret_${tag}`;
  const otherChannel = `ch_ret_other_${tag}`;
  const day = 86_400_000;
  const keys: string[] = [];
  let owner: Client;
  let member: Client;

  const ago = (days: number) => new Date(Date.now() - days * day);
  const message = (id: string, chan: string, author: string, days: number, root: string | null = null) =>
    db().query(
      `INSERT INTO messages (id, channel_id, author_id, body, thread_root_id, created_at) VALUES ($1,$2,$3,'x',$4,$5)`,
      [`${id}_${tag}`, chan, author, root ? `${root}_${tag}` : null, ago(days)],
    );
  const exists = async (id: string) =>
    ((await db().query(`SELECT 1 FROM messages WHERE id = $1`, [`${id}_${tag}`])).rowCount ?? 0) > 0;

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);

    for (const [id, slug, days] of [[ws, "a", 30], [other, "b", null]] as const) {
      await db().query(`INSERT INTO workspaces (id, name, slug, initials, settings) VALUES ($1,$2,$3,'RT',$4)`, [
        id, `Retention ${slug} ${tag}`, `ret-${slug}-${tag}`, JSON.stringify(days ? { messageRetentionDays: days } : {}),
      ]);
    }
    for (const [u, w, c] of [[user, ws, channel], [otherUser, other, otherChannel]] as const) {
      await db().query(
        `INSERT INTO users (id, workspace_id, username, display_name, full_name, email) VALUES ($1,$2,'ret','Ret','Ret',$3)`,
        [u, w, `${u}@example.com`],
      );
      await db().query(`INSERT INTO channels (id, workspace_id, kind, name) VALUES ($1,$2,'public','general')`, [c, w]);
    }

    await message("old", channel, user, 100);
    await message("recent", channel, user, 1);
    // A thread starter that is old, with a reply that is not.
    await message("root_live", channel, user, 100);
    await message("reply_new", channel, user, 1, "root_live");
    // A thread that is old all the way through.
    await message("root_dead", channel, user, 100);
    await message("reply_old", channel, user, 99, "root_dead");
    // The same age in a workspace with no retention.
    await message("other_old", otherChannel, otherUser, 100);

    // An old message with a file on disk, and a reaction.
    const key = `retention-test/${tag}/file.txt`;
    keys.push(key);
    await storage.put(key, Buffer.from("hello"));
    await db().query(
      `INSERT INTO attachments (id, message_id, channel_id, uploaded_by, name, kind, mime_type, size_bytes, storage_key)
       VALUES ($1,$2,$3,$4,'file.txt','file','text/plain',5,$5)`,
      [`att_ret_${tag}`, `old_${tag}`, channel, user, key],
    );
    await db().query(`INSERT INTO reactions (message_id, user_id, emoji, name) VALUES ($1,$2,'x','x')`, [`old_${tag}`, user]);
  });

  afterAll(async () => {
    await db().query(`DELETE FROM workspaces WHERE id = ANY($1::text[])`, [workspaces]); // cascades
    await Promise.all(keys.map((key) => storage.remove(key)));
    await redis.quit();
    await closeDb();
  });

  describe("what counts as a retention", () => {
    it("never reads unset, zero or invalid values as 'delete everything'", () => {
      for (const days of [null, undefined, 0, -5, 0.5, Number.NaN, "90", Infinity]) {
        expect(cutoffFor(days)).toBeNull();
      }
      expect(cutoffFor(90, new Date("2026-06-01T00:00:00Z"))?.toISOString()).toBe("2026-03-03T00:00:00.000Z");
    });
  });

  describe("preview", () => {
    it("counts what would go, sparing a thread that still has recent replies", async () => {
      // old, root_dead, reply_old go; recent, root_live (has a recent reply) and reply_new stay.
      expect(await countDue(ws, 30)).toBe(3);
      expect(await countDue(other, 30)).toBe(1);
      expect(await countDue(ws, 0)).toBe(0);
    });

    it("is open to administrators only, and rejects periods that are too short", async () => {
      expect((await member.fetch("/admin/retention?days=90")).status).toBe(403);
      for (const bad of ["", "abc", "1", "29", "1.5", "99999"]) {
        expect((await owner.fetch(`/admin/retention?days=${bad}`)).status, bad).toBe(400);
      }
      const ok = await owner.fetch("/admin/retention?days=90");
      expect(ok.status).toBe(200);
      expect(typeof ((await ok.json()) as { messages: number }).messages).toBe("number");
    });

    it("cannot be set to a period short enough to be a mistake", async () => {
      for (const days of [1, 7, 29, -1]) {
        const response = await owner.fetch("/admin/settings", {
          method: "PATCH",
          body: JSON.stringify({ messageRetentionDays: days }),
        });
        expect(response.status, String(days)).toBe(400);
      }
    });
  });

  describe("running", () => {
    it("deletes what is due, with its file, reaction and audit entry, and nothing else", async () => {
      const results = await runRetention(new Date(), workspaces);
      expect(results[ws]).toEqual({ messages: 3, files: 1 });

      expect(await exists("old")).toBe(false);
      expect(await exists("root_dead")).toBe(false);
      expect(await exists("reply_old")).toBe(false);
      expect(await exists("recent")).toBe(true);
      expect(await exists("root_live")).toBe(true);
      expect(await exists("reply_new")).toBe(true);

      expect(await storage.exists(keys[0])).toBe(false);
      expect((await db().query(`SELECT 1 FROM reactions WHERE message_id = $1`, [`old_${tag}`])).rowCount).toBe(0);
      expect((await db().query(`SELECT 1 FROM attachments WHERE id = $1`, [`att_ret_${tag}`])).rowCount).toBe(0);

      const audit = await db().query<{ target: string; actor_id: string | null }>(
        `SELECT target, actor_id FROM audit_log WHERE workspace_id = $1 AND action = 'retention.purged'`,
        [ws],
      );
      expect(audit.rows).toEqual([{ target: "3 messages and 1 files older than 30 days", actor_id: null }]);
    });

    it("leaves a workspace with no retention alone", async () => {
      expect(await exists("other_old")).toBe(true);
      expect((await runRetention(new Date(), [other]))[other]).toBeUndefined();
      expect(await exists("other_old")).toBe(true);
    });

    it("has nothing left to do the second time", async () => {
      expect((await runRetention(new Date(), [ws]))[ws]).toEqual({ messages: 0, files: 0 });
    });

    it("works through a backlog larger than one batch", async () => {
      for (let i = 0; i < 1_300; i += 1) {
        await db().query(
          `INSERT INTO messages (id, channel_id, author_id, body, created_at) VALUES ($1,$2,$3,'x',$4)`,
          [`bulk_${i}_${tag}`, channel, user, ago(200)],
        );
      }
      const result = await purgeMessages(ws, ago(30));
      expect(result.messages).toBe(1_300);
    });
  });
});
