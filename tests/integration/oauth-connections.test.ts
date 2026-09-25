import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptSecret } from "@server/lib/secrets";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

/**
 * Outgoing OAuth connections, and the thing that makes them mean anything.
 *
 * Until these existed, the connection flow stored an access token that nothing
 * ever read — a credential store with an OAuth dance in front of it.
 */
describe("using an outgoing OAuth connection", () => {
  let admin: Client;
  let provider: Server;
  let receiver: Server;
  let providerUrl = "";
  let receiverUrl = "";

  /** What the fake provider will hand back, and what it was asked for. */
  const provided = { issued: 0, lastGrant: "", lastRefreshToken: "" };
  const delivered: { authorization: string | undefined }[] = [];

  beforeAll(async () => {
    await assertServerRunning();
    admin = await signIn(ACCOUNTS.owner);

    provider = createServer((request, response) => {
      let raw = "";
      request.on("data", (chunk) => (raw += chunk));
      request.on("end", () => {
        const form = new URLSearchParams(raw);
        provided.lastGrant = form.get("grant_type") ?? "";
        provided.lastRefreshToken = form.get("refresh_token") ?? "";
        provided.issued += 1;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            access_token: `fresh-token-${provided.issued}`,
            refresh_token: `rotated-refresh-${provided.issued}`,
            expires_in: 3_600,
          }),
        );
      });
    });
    await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
    providerUrl = `http://127.0.0.1:${(provider.address() as { port: number }).port}/token`;

    receiver = createServer((request, response) => {
      request.on("data", () => {});
      request.on("end", () => {
        delivered.push({ authorization: request.headers.authorization });
        response.writeHead(200);
        response.end("ok");
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    receiverUrl = `http://127.0.0.1:${(receiver.address() as { port: number }).port}/hook`;
  });

  afterAll(async () => {
    provider.close();
    receiver.close();
    await db().query(`DELETE FROM outgoing_webhooks WHERE name LIKE 'conn-test-%'`);
    await db().query(`DELETE FROM outgoing_oauth_connections WHERE name LIKE 'conn-test-%'`);
    await closeDb();
  });

  const unique = () => Date.now().toString(36) + randomBytes(2).toString("hex");

  /**
   * Creates a connection already holding an *expired* token, the way one looks
   * an hour after it was authorised.
   */
  const connectWithExpiredToken = async () => {
    const name = `conn-test-${unique()}`;
    const created = (await admin
      .fetch("/admin/integrations/oauth-connections", {
        method: "POST",
        body: JSON.stringify({
          name,
          provider: "Test",
          clientId: "test-client",
          clientSecret: "test-secret",
          authorizeUrl: "https://example.com/authorize",
          tokenUrl: providerUrl,
          scopes: ["repo"],
        }),
      })
      .then((r) => r.json())) as { id: string };

    await db().query(
      `UPDATE outgoing_oauth_connections
          SET access_token_enc = $2, refresh_token_enc = $3,
              token_expires_at = now() - interval '5 minutes',
              status = 'connected'
        WHERE id = $1`,
      [created.id, encryptSecret("stale-token"), encryptSecret("the-refresh-token")],
    );
    return { id: created.id, name };
  };

  it("refreshes an expired token and sends the new one, not the stale one", async () => {
    const connection = await connectWithExpiredToken();
    const before = delivered.length;

    await admin.fetch("/admin/integrations/outgoing-webhooks", {
      method: "POST",
      body: JSON.stringify({
        name: `conn-test-${unique()}`,
        channelId: "ch_general",
        targetUrl: receiverUrl,
        triggerWords: ["authcheck"],
        connectionId: connection.id,
      }),
    });

    await admin.fetch("/channels/ch_general/messages", {
      method: "POST",
      body: JSON.stringify({ channelId: "ch_general", body: "authcheck please" }),
    });

    // Dispatch is detached from the response.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(delivered.length).toBeGreaterThan(before);

    const last = delivered[delivered.length - 1];
    expect(provided.lastGrant).toBe("refresh_token");
    expect(provided.lastRefreshToken).toBe("the-refresh-token");
    expect(last.authorization).toBe(`Bearer fresh-token-${provided.issued}`);
    expect(last.authorization).not.toContain("stale-token");
  });

  it("stores the rotated refresh token, so the old one is not reused", async () => {
    const { rows } = await db().query<{ refresh_token_enc: string; status: string }>(
      `SELECT refresh_token_enc, status FROM outgoing_oauth_connections
        WHERE name LIKE 'conn-test-%' AND refresh_token_enc IS NOT NULL
        ORDER BY connected_at DESC LIMIT 1`,
    );
    expect(rows[0].status).toBe("connected");
    // Encrypted, and no longer the value we seeded.
    expect(rows[0].refresh_token_enc).toMatch(/^v1\./);
    expect(rows[0].refresh_token_enc).not.toContain("the-refresh-token");
  });

  it("records an error and sends unauthenticated when the provider refuses", async () => {
    const name = `conn-test-${unique()}`;
    const created = (await admin
      .fetch("/admin/integrations/oauth-connections", {
        method: "POST",
        body: JSON.stringify({
          name,
          clientId: "c",
          clientSecret: "s",
          authorizeUrl: "https://example.com/authorize",
          tokenUrl: "https://example.com/token",
          scopes: [],
        }),
      })
      .then((r) => r.json())) as { id: string };

    // Never authorised, so there is no token to use.
    await db().query(
      `UPDATE outgoing_oauth_connections SET status = 'connected' WHERE id = $1`,
      [created.id],
    );

    const before = delivered.length;
    await admin.fetch("/admin/integrations/outgoing-webhooks", {
      method: "POST",
      body: JSON.stringify({
        name: `conn-test-${unique()}`,
        channelId: "ch_general",
        targetUrl: receiverUrl,
        triggerWords: ["noauth"],
        connectionId: created.id,
      }),
    });

    await admin.fetch("/channels/ch_general/messages", {
      method: "POST",
      body: JSON.stringify({ channelId: "ch_general", body: "noauth please" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    // The delivery still goes out — a broken connection must not silently
    // swallow the webhook — but without an Authorization header.
    expect(delivered.length).toBeGreaterThan(before);
    expect(delivered[delivered.length - 1].authorization).toBeUndefined();

    const { rows } = await db().query<{ status: string; last_error: string }>(
      `SELECT status, last_error FROM outgoing_oauth_connections WHERE id = $1`,
      [created.id],
    );
    expect(rows[0].status).toBe("error");
    expect(rows[0].last_error).toContain("Not authorised");
  });

  it("keeps the webhook when its connection is deleted, rather than deleting it too", async () => {
    const connection = await connectWithExpiredToken();
    const hookName = `conn-test-${unique()}`;
    await admin.fetch("/admin/integrations/outgoing-webhooks", {
      method: "POST",
      body: JSON.stringify({
        name: hookName,
        channelId: "ch_general",
        targetUrl: receiverUrl,
        triggerWords: ["orphan"],
        connectionId: connection.id,
      }),
    });

    await admin.fetch(`/admin/integrations/oauth-connections/${connection.id}`, {
      method: "DELETE",
    });

    const list = (await admin
      .fetch("/admin/integrations/outgoing-webhooks")
      .then((r) => r.json())) as { name: string; connectionId: string | null }[];
    const hook = list.find((entry) => entry.name === hookName);

    // ON DELETE SET NULL, not CASCADE: losing a connection must not silently
    // delete the webhooks that used it.
    expect(hook).toBeDefined();
    expect(hook?.connectionId).toBeNull();
  });
});
