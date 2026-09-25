import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

interface SearchGroup {
  kind: string;
  results: { refId: string; title: string; snippet: string }[];
}

describe("search", () => {
  let insider: Client;
  let outsider: Client;
  let privateChannelId = "";
  /** A term unlikely to collide with seeded copy. */
  const SECRET = `zarquon${Date.now().toString().slice(-6)}`;
  const channels: string[] = [];

  beforeAll(async () => {
    await assertServerRunning();
    insider = await signIn(ACCOUNTS.member);
    outsider = await signIn(ACCOUNTS.admin);

    const channel = (await insider
      .fetch("/channels", {
        method: "POST",
        body: JSON.stringify({
          name: `secret-${Date.now().toString().slice(-6)}`,
          purpose: `A private channel about ${SECRET}`,
          kind: "private",
        }),
      })
      .then((r) => r.json())) as { id: string };
    privateChannelId = channel.id;
    channels.push(channel.id);

    await insider.fetch(`/channels/${privateChannelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ channelId: privateChannelId, body: `The password is ${SECRET}` }),
    });
  });

  afterAll(async () => {
    if (channels.length) {
      await db().query(`DELETE FROM channels WHERE id = ANY($1::text[])`, [channels]);
    }
    await closeDb();
  });

  const search = (client: Client, term: string) =>
    client.fetch(`/search?q=${encodeURIComponent(term)}`).then((r) => r.json() as Promise<SearchGroup[]>);

  it("finds a message in a channel the caller belongs to", async () => {
    const groups = await search(insider, SECRET);
    const messages = groups.find((group) => group.kind === "message");
    expect(messages?.results.some((result) => result.snippet.includes(SECRET))).toBe(true);
  });

  it("does not leak a private channel's messages to a non-member", async () => {
    const groups = await search(outsider, SECRET);
    const messages = groups.find((group) => group.kind === "message");
    expect(messages?.results ?? []).toEqual([]);
  });

  it("does not leak the private channel itself to a non-member", async () => {
    const groups = await search(outsider, SECRET);
    const found = groups.find((group) => group.kind === "channel");
    expect((found?.results ?? []).map((result) => result.refId)).not.toContain(privateChannelId);
  });

  it("still lists people workspace-wide — the directory is not channel-scoped", async () => {
    const groups = await search(outsider, "Bob");
    const people = groups.find((group) => group.kind === "person");
    expect(people?.results.length).toBeGreaterThan(0);
  });

  it("returns nothing for an empty term rather than everything", async () => {
    expect(await search(insider, "   ")).toEqual([]);
  });
});

describe("threads", () => {
  let author: Client;
  let follower: Client;
  let rootId = "";
  const created: string[] = [];

  beforeAll(async () => {
    await assertServerRunning();
    author = await signIn(ACCOUNTS.member);
    follower = await signIn(ACCOUNTS.admin);

    const root = (await author
      .fetch("/channels/ch_general/messages", {
        method: "POST",
        body: JSON.stringify({ channelId: "ch_general", body: "A root worth following" }),
      })
      .then((r) => r.json())) as { id: string };
    rootId = root.id;
    created.push(root.id);
  });

  afterAll(async () => {
    if (created.length) {
      await db().query(`DELETE FROM messages WHERE id = ANY($1::text[])`, [created]);
    }
    await closeDb();
  });

  const reply = async (client: Client, body: string) => {
    const message = (await client
      .fetch("/channels/ch_general/messages", {
        method: "POST",
        body: JSON.stringify({ channelId: "ch_general", body, threadRootId: rootId }),
      })
      .then((r) => r.json())) as { id: string };
    created.push(message.id);
    return message;
  };

  const inbox = (client: Client) =>
    client
      .fetch("/threads/inbox")
      .then(
        (r) =>
          r.json() as Promise<
            { thread: { rootId: string; unreadReplyCount: number } }[]
          >,
      );

  it("puts a followed thread in the follower's inbox", async () => {
    expect(
      (
        await follower.fetch(`/threads/${rootId}/follow`, {
          method: "PUT",
          body: JSON.stringify({ isFollowing: true }),
        })
      ).status,
    ).toBe(204);

    await reply(author, "A reply the follower should hear about");

    const items = await inbox(follower);
    expect(items.map((item) => item.thread.rootId)).toContain(rootId);
  });

  it("clears the unread count when the thread is marked read", async () => {
    await reply(author, "Another reply");

    const before = (await inbox(follower)).find((item) => item.thread.rootId === rootId);
    expect(before?.thread.unreadReplyCount ?? 0).toBeGreaterThan(0);

    expect(
      (await follower.fetch(`/threads/${rootId}/read`, { method: "POST" })).status,
    ).toBe(204);

    const after = (await inbox(follower)).find((item) => item.thread.rootId === rootId);
    expect(after?.thread.unreadReplyCount).toBe(0);
  });

  it("drops the thread from the inbox when unfollowed", async () => {
    await follower.fetch(`/threads/${rootId}/follow`, {
      method: "PUT",
      body: JSON.stringify({ isFollowing: false }),
    });

    const items = await inbox(follower);
    expect(items.map((item) => item.thread.rootId)).not.toContain(rootId);
  });

  it("returns replies oldest-first — a thread reads top to bottom", async () => {
    const page = (await author
      .fetch(`/messages/${rootId}/replies`)
      .then((r) => r.json())) as { items: { createdAt: string }[] };

    const times = page.items.map((item) => Date.parse(item.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
