import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

describe("messages", () => {
  let owner: Client;
  const created: string[] = [];

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
  });

  afterAll(async () => {
    if (created.length) {
      await db().query(`DELETE FROM messages WHERE id = ANY($1::text[])`, [created]);
    }
    await closeDb();
  });

  /**
   * The client renders an optimistic message under a temporary id and swaps in
   * the server's copy when this response lands. If the response stopped
   * carrying the message, that reconciliation would silently break and every
   * sent message would render twice.
   */
  it("returns the created message with its server-assigned id", async () => {
    const response = await owner.fetch("/channels/ch_general/messages", {
      method: "POST",
      body: JSON.stringify({ body: "Contract check for optimistic reconciliation" }),
    });

    expect(response.status).toBe(201);
    const message = (await response.json()) as { id: string; channelId: string; authorId: string };
    created.push(message.id);

    expect(message.id).toBeTruthy();
    expect(message.id.startsWith("pending_")).toBe(false);
    expect(message.channelId).toBe("ch_general");
    expect(message.authorId).toBe(owner.userId);
  });

  it("resolves @mentions server-side from the body text", async () => {
    const response = await owner.fetch("/channels/ch_general/messages", {
      method: "POST",
      body: JSON.stringify({ body: "Ping for @alice about the rollout" }),
    });
    const message = (await response.json()) as { id: string; mentionedUserIds: string[] };
    created.push(message.id);

    expect(message.mentionedUserIds).toContain("u_alice");
  });

  it("rejects an empty message", async () => {
    const response = await owner.fetch("/channels/ch_general/messages", {
      method: "POST",
      body: JSON.stringify({ body: "   " }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects a body beyond the length cap", async () => {
    const response = await owner.fetch("/channels/ch_general/messages", {
      method: "POST",
      body: JSON.stringify({ body: "x".repeat(13_000) }),
    });
    expect(response.status).toBe(400);
  });
});
