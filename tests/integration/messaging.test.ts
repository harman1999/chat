import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

const CHANNEL = "ch_general";

describe("message lifecycle", () => {
  let author: Client;
  let other: Client;
  const created: string[] = [];

  beforeAll(async () => {
    await assertServerRunning();
    author = await signIn(ACCOUNTS.member);
    other = await signIn(ACCOUNTS.admin);
  });

  afterAll(async () => {
    if (created.length) {
      await db().query(`DELETE FROM messages WHERE id = ANY($1::text[])`, [created]);
    }
    await closeDb();
  });

  const post = async (client: Client, body: string) => {
    const response = await client.fetch(`/channels/${CHANNEL}/messages`, {
      method: "POST",
      body: JSON.stringify({ channelId: CHANNEL, body }),
    });
    const message = (await response.json()) as { id: string; body: string };
    if (message.id) created.push(message.id);
    return message;
  };

  describe("reactions", () => {
    it("adds a reaction and counts the reactor once", async () => {
      const message = await post(author, "A message to react to");

      const response = await author.fetch(`/messages/${message.id}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji: "👍" }),
      });
      expect(response.status).toBe(204);

      const fetched = await author
        .fetch(`/messages/${message.id}`)
        .then((r) => r.json() as Promise<{ reactions: { emoji: string; userIds: string[] }[] }>);

      expect(fetched.reactions).toHaveLength(1);
      expect(fetched.reactions[0].emoji).toBe("👍");
      expect(fetched.reactions[0].userIds).toEqual([author.userId]);
    });

    it("is idempotent — reacting twice does not double-count", async () => {
      const message = await post(author, "A message reacted to twice");
      for (let i = 0; i < 2; i += 1) {
        await author.fetch(`/messages/${message.id}/reactions`, {
          method: "POST",
          body: JSON.stringify({ emoji: "🎉" }),
        });
      }

      const { rows } = await db().query<{ count: string }>(
        `SELECT count(*)::text FROM reactions WHERE message_id = $1 AND user_id = $2`,
        [message.id, author.userId],
      );
      expect(rows[0].count).toBe("1");
    });

    it("removes only the caller's own reaction", async () => {
      const message = await post(author, "A message two people react to");
      for (const client of [author, other]) {
        await client.fetch(`/messages/${message.id}/reactions`, {
          method: "POST",
          body: JSON.stringify({ emoji: "👀" }),
        });
      }

      const response = await author.fetch(
        `/messages/${message.id}/reactions/${encodeURIComponent("👀")}`,
        { method: "DELETE" },
      );
      expect(response.status).toBe(204);

      const fetched = await other
        .fetch(`/messages/${message.id}`)
        .then((r) => r.json() as Promise<{ reactions: { userIds: string[] }[] }>);
      expect(fetched.reactions[0].userIds).toEqual([other.userId]);
    });
  });

  describe("editing", () => {
    it("updates the body and stamps editedAt", async () => {
      const message = await post(author, "The first draft");

      const response = await author.fetch(`/messages/${message.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body: "The second draft" }),
      });
      expect(response.status).toBe(204);

      const fetched = await author
        .fetch(`/messages/${message.id}`)
        .then((r) => r.json() as Promise<{ body: string; editedAt: string | null }>);
      expect(fetched.body).toBe("The second draft");
      expect(fetched.editedAt).not.toBeNull();
    });

    it("refuses to let someone edit a message they did not write", async () => {
      const message = await post(author, "Not yours to edit");

      const response = await other.fetch(`/messages/${message.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body: "Rewritten by someone else" }),
      });
      expect(response.status).toBe(403);

      const fetched = await author
        .fetch(`/messages/${message.id}`)
        .then((r) => r.json() as Promise<{ body: string }>);
      expect(fetched.body).toBe("Not yours to edit");
    });
  });

  describe("deleting", () => {
    it("soft-deletes so the thread structure survives", async () => {
      const message = await post(author, "A message to delete");

      expect((await author.fetch(`/messages/${message.id}`, { method: "DELETE" })).status).toBe(204);

      const { rows } = await db().query<{ deleted_at: Date | null; body: string }>(
        `SELECT deleted_at, body FROM messages WHERE id = $1`,
        [message.id],
      );
      // The row must still be there — replies reference it by foreign key.
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();
    });

    it("refuses to let someone delete a message they did not write", async () => {
      const message = await post(author, "Not yours to delete");
      expect((await other.fetch(`/messages/${message.id}`, { method: "DELETE" })).status).toBe(403);
    });
  });

  describe("saving", () => {
    it("adds to and removes from the caller's saved list", async () => {
      const message = await post(author, "A message worth keeping");

      await author.fetch(`/messages/${message.id}/save`, {
        method: "PUT",
        body: JSON.stringify({ isSaved: true }),
      });
      const saved = await author
        .fetch("/me/saved")
        .then((r) => r.json() as Promise<{ id: string }[]>);
      expect(saved.map((m) => m.id)).toContain(message.id);

      await author.fetch(`/messages/${message.id}/save`, {
        method: "PUT",
        body: JSON.stringify({ isSaved: false }),
      });
      const after = await author
        .fetch("/me/saved")
        .then((r) => r.json() as Promise<{ id: string }[]>);
      expect(after.map((m) => m.id)).not.toContain(message.id);
    });

    it("saves for the caller only", async () => {
      const message = await post(author, "Saved by one person only");
      await author.fetch(`/messages/${message.id}/save`, {
        method: "PUT",
        body: JSON.stringify({ isSaved: true }),
      });

      const theirs = await other
        .fetch("/me/saved")
        .then((r) => r.json() as Promise<{ id: string }[]>);
      expect(theirs.map((m) => m.id)).not.toContain(message.id);
    });
  });
});
