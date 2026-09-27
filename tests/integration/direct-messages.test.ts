import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

describe("opening a direct message", () => {
  let me: Client;
  let other: Client;
  const opened: string[] = [];
  /**
   * The conversations that existed before this suite ran.
   *
   * Opening a direct message is idempotent, so opening a *seeded* one returns
   * its existing id. Deleting everything this suite touched would therefore
   * delete seeded conversations — the very property the feature is built on
   * turns a naive cleanup destructive.
   */
  let preExisting = new Set<string>();

  beforeAll(async () => {
    await assertServerRunning();
    me = await signIn(ACCOUNTS.owner);
    other = await signIn(ACCOUNTS.member);

    const { rows } = await db().query<{ id: string }>(
      `SELECT id FROM channels WHERE kind IN ('dm','group_dm')`,
    );
    preExisting = new Set(rows.map((row) => row.id));
  });

  afterAll(async () => {
    const mine = opened.filter((id) => !preExisting.has(id));
    if (mine.length) {
      await db().query(`DELETE FROM channels WHERE id = ANY($1::text[])`, [mine]);
    }
    await closeDb();
  });

  const open = async (client: Client, userId: string) => {
    const response = await client.fetch("/dms", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    const body = await response.json();
    if (body?.id) opened.push(body.id);
    return { response, body };
  };

  it("opens a conversation with someone", async () => {
    const { response, body } = await open(me, "u_alice");
    expect(response.status).toBe(200);
    expect(body.kind).toBe("dm");
    // A DM is named after the other participant, not itself.
    expect(body.name).toBeTruthy();
    expect(body.memberCount).toBe(2);
  });

  it("returns the same conversation when opened again", async () => {
    const first = await open(me, "u_dir_1");
    const second = await open(me, "u_dir_1");

    // The point of the feature: asking twice must not split the history.
    expect(second.body.id).toBe(first.body.id);

    const { rows } = await db().query<{ count: string }>(
      `SELECT count(*)::text FROM channels c
        WHERE c.kind = 'dm'
          AND (SELECT count(*) FROM channel_members m WHERE m.channel_id = c.id) = 2
          AND EXISTS (SELECT 1 FROM channel_members m WHERE m.channel_id = c.id AND m.user_id = $1)
          AND EXISTS (SELECT 1 FROM channel_members m WHERE m.channel_id = c.id AND m.user_id = 'u_dir_1')`,
      [me.userId],
    );
    expect(rows[0].count).toBe("1");
  });

  it("finds the conversation the other person opened", async () => {
    const theirs = await open(other, me.userId);
    const mine = await open(me, other.userId);
    expect(mine.body.id).toBe(theirs.body.id);
  });

  it("refuses a conversation with yourself", async () => {
    const { response, body } = await open(me, me.userId);
    expect(response.status).toBe(422);
    expect(body.code).toBe("self_dm");
  });

  it("opens a conversation with someone who has not accepted their invitation", async () => {
    // The picker offers everyone the directory returns, which includes invited
    // accounts. Refusing them here made the dialog offer people it could not
    // actually message.
    const { rows } = await db().query<{ id: string }>(
      `SELECT id FROM users
        WHERE workspace_id = 'ws_northwind' AND account_status = 'invited' AND NOT is_bot
        LIMIT 1`,
    );
    expect(rows.length).toBe(1);

    const { response, body } = await open(me, rows[0].id);
    expect(response.status).toBe(200);
    expect(body.memberCount).toBe(2);
  });

  it("refuses a deactivated account", async () => {
    const { rows } = await db().query<{ id: string }>(
      `SELECT id FROM users WHERE account_status = 'deactivated' LIMIT 1`,
    );
    if (rows.length === 0) return;
    const { response } = await open(me, rows[0].id);
    expect(response.status).toBe(404);
  });

  it("refuses an unknown person", async () => {
    const { response } = await open(me, "u_does_not_exist");
    expect(response.status).toBe(404);
  });

  it("leaves no half-built conversation behind when it refuses", async () => {
    await open(me, "u_does_not_exist");
    const { rows } = await db().query<{ count: string }>(
      `SELECT count(*)::text FROM channels
        WHERE kind = 'dm'
          AND (SELECT count(*) FROM channel_members m WHERE m.channel_id = channels.id) < 2`,
    );
    expect(rows[0].count).toBe("0");
  });

  it("shows up in the caller's direct message list", async () => {
    const { body } = await open(me, "u_sarah");
    const list = (await me
      .fetch("/workspaces/ws_northwind/dms")
      .then((r) => r.json())) as { id: string }[];
    expect(list.map((dm) => dm.id)).toContain(body.id);
  });

  it("requires a session", async () => {
    const response = await fetch(`${process.env.TEST_BASE_URL ?? "http://localhost:3000"}/api/v1/dms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u_bob" }),
    });
    expect(response.status).toBe(401);
  });
});
