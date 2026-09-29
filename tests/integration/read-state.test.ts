import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

/**
 * Nothing used to mark a channel read when it was opened, so every unread badge
 * stayed until you posted in the channel. All of this happens in a channel the
 * suite creates and removes, so it never touches anyone's real read state.
 */
describe("read state", () => {
  const tag = Date.now().toString(36);
  let alice: Client;
  let bob: Client;
  let owner: Client;
  let channelId = "";

  const counts = async (client: Client, id = channelId) => {
    const c = (await (await client.fetch(`/channels/${id}`)).json()) as { unreadCount: number; mentionCount: number };
    return { unread: c.unreadCount, mentions: c.mentionCount };
  };
  const post = (body: string) =>
    alice.fetch(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ channelId, body }) });
  const bobsNotifications = async () =>
    (
      await db().query<{ is_read: boolean }>(
        `SELECT is_read FROM notifications WHERE user_id = 'u_bob' AND channel_id = $1`,
        [channelId],
      )
    ).rows.map((row) => row.is_read);

  beforeAll(async () => {
    await assertServerRunning();
    alice = await signIn(ACCOUNTS.admin);
    bob = await signIn(ACCOUNTS.member);
    owner = await signIn(ACCOUNTS.owner);
    const created = await alice.fetch("/channels", {
      method: "POST",
      body: JSON.stringify({ name: `readtest-${tag}`, memberIds: ["u_bob"] }),
    });
    expect(created.status).toBe(201);
    channelId = ((await created.json()) as { id: string }).id;
  });

  afterAll(async () => {
    if (channelId) await db().query(`DELETE FROM channels WHERE id = $1`, [channelId]); // cascades
    await closeDb();
  });

  it("counts what others post, and mentions separately", async () => {
    await post("something to read");
    await post("and one for @bob");
    expect(await counts(bob)).toEqual({ unread: 2, mentions: 1 });
    expect(await bobsNotifications()).toEqual([false]);
  });

  it("does not count your own messages", async () => {
    expect(await counts(alice)).toEqual({ unread: 0, mentions: 0 });
  });

  it("clears unread, mentions and the channel's notifications when read", async () => {
    const generalBefore = await counts(bob, "ch_general");
    expect((await bob.fetch(`/channels/${channelId}/read`, { method: "POST" })).status).toBe(204);

    expect(await counts(bob)).toEqual({ unread: 0, mentions: 0 });
    expect(await bobsNotifications()).toEqual([true]);
    // Only this channel: everything else stays as it was.
    expect(await counts(bob, "ch_general")).toEqual(generalBefore);
  });

  it("counts again from the next message on", async () => {
    await post("a new one");
    expect(await counts(bob)).toEqual({ unread: 1, mentions: 0 });
  });

  it("marks only the caller's own state", async () => {
    await bob.fetch(`/channels/${channelId}/read`, { method: "POST" });
    await post("another for @bob");
    // Alice reading does not clear Bob's.
    await alice.fetch(`/channels/${channelId}/read`, { method: "POST" });
    expect(await counts(bob)).toEqual({ unread: 1, mentions: 1 });
    expect(await bobsNotifications()).toContain(false);
  });

  it("gives someone outside the channel nothing", async () => {
    const before = await db().query(`SELECT 1 FROM channel_members WHERE channel_id = $1`, [channelId]);
    expect((await owner.fetch(`/channels/${channelId}/read`, { method: "POST" })).status).toBe(204);
    const after = await db().query(`SELECT 1 FROM channel_members WHERE channel_id = $1`, [channelId]);
    expect(after.rowCount).toBe(before.rowCount);
  });
});
