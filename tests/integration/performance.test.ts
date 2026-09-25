import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

/**
 * Guards the shape of the expensive reads: unbounded queries and N+1 loops are
 * invisible on seed-sized data and fatal on real data.
 */
describe("query shape", () => {
  let owner: Client;

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
  });

  afterAll(closeDb);

  it("serves the threads inbox without scaling per followed thread", async () => {
    const time = async () => {
      await owner.fetch("/threads/inbox"); // warm caches and the session lookup
      const started = performance.now();
      const response = await owner.fetch("/threads/inbox");
      const elapsed = performance.now() - started;
      const entries = (await response.json()) as { thread: { rootId: string } }[];
      return { elapsed, entries };
    };

    const baseline = await time();
    expect(baseline.entries.length).toBeGreaterThan(0);

    // Follow many more threads. Under the previous implementation this cost two
    // extra queries each, so the response time grew with the count.
    await db().query(
      `INSERT INTO thread_follows (user_id, root_id, last_read_at)
       SELECT $1, m.id, now() FROM messages m
       WHERE m.thread_root_id IS NULL AND m.channel_id = 'ch_general'
       LIMIT 60
       ON CONFLICT DO NOTHING`,
      [owner.userId],
    );

    try {
      const scaled = await time();
      expect(scaled.entries.length).toBeGreaterThan(baseline.entries.length * 5);

      // Every entry is fully populated — batching must not drop rows.
      for (const entry of scaled.entries) {
        expect(entry).toHaveProperty("root.id");
        expect(entry).toHaveProperty("channel.id");
      }

      // A generous ceiling: correct code answers in tens of milliseconds, an
      // N+1 over 60 threads does not.
      expect(scaled.elapsed).toBeLessThan(1_000);
    } finally {
      await db().query(
        `DELETE FROM thread_follows WHERE user_id = $1
         AND root_id NOT IN ('m_gen_6','m_dev_4','m_be_2','m_sup_3')`,
        [owner.userId],
      );
    }
  });

  it("caps thread replies to a page and reports whether more exist", async () => {
    const response = await owner.fetch("/messages/m_gen_6/replies");
    expect(response.status).toBe(200);

    const page = (await response.json()) as {
      items: unknown[];
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items.length).toBeLessThanOrEqual(50);
    expect(typeof page.hasMore).toBe("boolean");
    // Short thread: everything fits in one page.
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("pages a thread longer than one page", async () => {
    const rootId = "m_gen_6";
    const madeIds: string[] = [];

    try {
      // 60 replies — beyond the 50-per-page cap.
      for (let i = 0; i < 60; i++) {
        const id = `m_pagetest_${i}`;
        madeIds.push(id);
        await db().query(
          `INSERT INTO messages (id, channel_id, author_id, kind, body, thread_root_id, created_at)
           VALUES ($1, 'ch_general', 'u_alice', 'text', $2, $3, now() + ($4 || ' seconds')::interval)`,
          [id, `Paged reply ${i}`, rootId, String(i)],
        );
      }

      const first = (await (await owner.fetch(`/messages/${rootId}/replies`)).json()) as {
        items: { id: string }[];
        hasMore: boolean;
        nextCursor: string | null;
      };

      expect(first.items).toHaveLength(50);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toBe(first.items.at(-1)!.id);

      const second = (await (
        await owner.fetch(`/messages/${rootId}/replies?cursor=${first.nextCursor}`)
      ).json()) as { items: { id: string }[]; hasMore: boolean };

      expect(second.items.length).toBeGreaterThan(0);
      expect(second.hasMore).toBe(false);

      // The pages must not overlap — a cursor off by one would duplicate rows.
      const firstIds = new Set(first.items.map((item) => item.id));
      expect(second.items.every((item) => !firstIds.has(item.id))).toBe(true);
    } finally {
      await db().query(`DELETE FROM messages WHERE id = ANY($1::text[])`, [madeIds]);
    }
  });

  it("caps the member list", async () => {
    const response = await owner.fetch("/channels/ch_general/members");
    const members = (await response.json()) as unknown[];

    const total = await db().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM channel_members WHERE channel_id = 'ch_general'`,
    );

    expect(members.length).toBeLessThanOrEqual(100);
    expect(members.length).toBeLessThanOrEqual(Number(total.rows[0].n));
  });

  it("caps the workspace directory", async () => {
    const response = await owner.fetch("/users");
    const users = (await response.json()) as unknown[];
    expect(users.length).toBeLessThanOrEqual(1000);
    expect(users.length).toBeGreaterThan(0);
  });
});
