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
  /**
   * Messages this suite posted. They are always deleted, even when the
   * conversation they went into was pre-existing — a note-to-self already exists
   * for anyone who has opened one, so without this the suite writes test text
   * into a real person's notes and inflates their Mentions count.
   */
  const posted: string[] = [];

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
    if (posted.length) {
      await db().query(`DELETE FROM messages WHERE id = ANY($1::text[])`, [posted]);
    }
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

  const post = async (client: Client, channelId: string, body: string) => {
    const response = await client.fetch(`/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ channelId, body }),
    });
    const message = (await response.json()) as { id: string; mentionedUserIds: string[] };
    if (message?.id) posted.push(message.id);
    return { response, message };
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

  describe("with yourself", () => {
    it("opens a private conversation with just you in it", async () => {
      const { response, body } = await open(me, me.userId);
      expect(response.status).toBe(200);
      expect(body.kind).toBe("dm");
      expect(body.memberCount).toBe(1);
      expect(body.memberIds).toEqual([me.userId]);
    });

    it("is named after you and shows your avatar, not a blank row", async () => {
      const { body } = await open(me, me.userId);
      const profile = (await me.fetch("/auth/me").then((r) => r.json())) as {
        displayName: string;
      };
      // With nobody "else" present, the name and participants used to be null.
      expect(body.name).toBe(profile.displayName);
      expect(body.participantIds).toEqual([me.userId]);
    });

    it("returns the same conversation each time", async () => {
      const first = await open(me, me.userId);
      const second = await open(me, me.userId);
      expect(second.body.id).toBe(first.body.id);
    });

    it("is never confused with a real conversation", async () => {
      // The note-to-self and a DM with someone else must be different rows,
      // in both directions.
      const self = await open(me, me.userId);
      const withBob = await open(me, other.userId);
      expect(self.body.id).not.toBe(withBob.body.id);
      expect(withBob.body.memberCount).toBe(2);
    });

    it("accepts a message, which is the whole point", async () => {
      const { body } = await open(me, me.userId);
      const { response } = await post(me, body.id, "Remember to rotate the keys");
      expect(response.status).toBe(201);
    });

    it("lets you tag yourself, and finds it again in Mentions", async () => {
      const { body: notes } = await open(me, me.userId);
      const profile = (await me.fetch("/auth/me").then((r) => r.json())) as { username: string };
      const text = `@${profile.username} follow up on the redaction review ${Date.now()}`;

      const { response, message } = await post(me, notes.id, text);
      expect(response.status).toBe(201);

      // Resolved server-side from the text, like any other mention.
      expect(message.mentionedUserIds).toContain(me.userId);

      const mentions = (await me.fetch("/me/mentions").then((r) => r.json())) as { id: string }[];
      expect(mentions.map((entry) => entry.id)).toContain(message.id);
    });

    it("does not notify you of a mention you just typed", async () => {
      const { body: notes } = await open(me, me.userId);
      const profile = (await me.fetch("/auth/me").then((r) => r.json())) as { username: string };

      const { message } = await post(me, notes.id, `@${profile.username} reminder`);

      const { rows } = await db().query<{ count: string }>(
        `SELECT count(*)::text FROM notifications WHERE message_id = $1`,
        [message.id],
      );
      expect(rows[0].count).toBe("0");
    });

    it("is invisible to everybody else", async () => {
      const { body } = await open(me, me.userId);
      const theirs = (await other
        .fetch("/workspaces/ws_northwind/dms")
        .then((r) => r.json())) as { id: string }[];
      expect(theirs.map((dm) => dm.id)).not.toContain(body.id);

      // Not just unlisted: unreadable.
      const read = await other.fetch(`/channels/${body.id}/messages`);
      expect(read.status).toBe(403);
    });
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
    // Measured as a before/after difference rather than a global invariant.
    // A one-member DM used to mean "the other half is missing"; now it can
    // also be a legitimate note-to-self, and the two are indistinguishable by
    // membership alone. What matters is that *this* refusal created nothing.
    const count = async () =>
      (await db().query<{ n: string }>(`SELECT count(*)::text AS n FROM channels WHERE kind = 'dm'`))
        .rows[0].n;

    const before = await count();
    const { response } = await open(me, "u_does_not_exist");
    expect(response.status).toBe(404);
    expect(await count()).toBe(before);
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
