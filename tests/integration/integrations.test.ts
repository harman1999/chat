import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, BASE_URL, closeDb, db, signIn, type Client } from "./helpers";

/** A stand-in for the external service an integration calls. */
interface Receiver {
  server: Server;
  url: string;
  received: { headers: Record<string, string>; body: unknown }[];
  reply: { status: number; body: string };
}

async function startReceiver(): Promise<Receiver> {
  const received: Receiver["received"] = [];
  const state = { reply: { status: 200, body: "ok" } };

  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => {
      received.push({
        headers: request.headers as Record<string, string>,
        body: raw ? JSON.parse(raw) : null,
      });
      response.writeHead(state.reply.status, { "Content-Type": "application/json" });
      response.end(state.reply.body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { server, url: `http://127.0.0.1:${port}/hook`, received, get reply() { return state.reply; }, set reply(v) { state.reply = v; } } as Receiver;
}

describe("integrations", () => {
  let admin: Client;
  let member: Client;
  let receiver: Receiver;
  const cleanupUsers: string[] = [];

  beforeAll(async () => {
    await assertServerRunning();
    admin = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
    receiver = await startReceiver();
  });

  afterAll(async () => {
    receiver.server.close();
    if (cleanupUsers.length) {
      await db().query(`DELETE FROM users WHERE id = ANY($1::text[])`, [cleanupUsers]);
    }
    await db().query(`DELETE FROM outgoing_webhooks WHERE name LIKE 'test-%'`);
    await db().query(`DELETE FROM slash_commands WHERE name LIKE 'test-%'`);
    await db().query(`DELETE FROM oauth_apps WHERE name LIKE 'test-%'`);
    await db().query(`DELETE FROM outgoing_oauth_connections WHERE name LIKE 'test-%'`);
    await closeDb();
  });

  const unique = () => Date.now().toString(36) + randomBytes(2).toString("hex");

  /* ---------------------------------------------------------------------- */

  describe("bot accounts", () => {
    let botToken = "";
    let botId = "";

    it("creates a bot and returns its token exactly once", async () => {
      const response = await admin.fetch("/admin/integrations/bots", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Deploy Bot",
          username: `deploybot${unique()}`,
          description: "Announces deployments",
        }),
      });
      expect(response.status).toBe(201);

      const payload = (await response.json()) as { bot: { id: string }; token: string };
      botToken = payload.token;
      botId = payload.bot.id;
      cleanupUsers.push(botId);

      expect(botToken).toMatch(/^hlx_bot_/);

      // Listing must never expose it again.
      const list = (await admin
        .fetch("/admin/integrations/bots")
        .then((r) => r.json())) as { id: string }[];
      expect(JSON.stringify(list)).not.toContain(botToken);
    });

    it("authenticates API calls as the bot", async () => {
      // The bot has to be in the channel, like any other author.
      await admin.fetch("/channels/ch_general/members", {
        method: "POST",
        body: JSON.stringify({ userIds: [botId] }),
      });

      const response = await fetch(`${BASE_URL}/api/v1/channels/ch_general/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({ channelId: "ch_general", body: "Deployed v2.1 to production" }),
      });
      expect(response.status).toBe(201);

      const message = (await response.json()) as { authorId: string };
      expect(message.authorId).toBe(botId);
    });

    it("refuses to administer the workspace", async () => {
      const response = await fetch(`${BASE_URL}/api/v1/admin/users`, {
        headers: { Authorization: `Bearer ${botToken}` },
      });
      expect(response.status).toBe(403);
    });

    it("refuses to take over the account it acts as", async () => {
      const response = await fetch(`${BASE_URL}/api/v1/users/me/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({ currentPassword: "x", newPassword: "an-even-longer-one" }),
      });
      expect(response.status).toBe(403);
    });

    it("stops working the moment its token is revoked", async () => {
      const tokens = (await admin
        .fetch(`/admin/integrations/bots/${botId}/tokens`)
        .then((r) => r.json())) as { id: string }[];

      await admin.fetch(`/admin/integrations/bots/${botId}/tokens/${tokens[0].id}`, {
        method: "DELETE",
      });

      const response = await fetch(`${BASE_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${botToken}` },
      });
      expect(response.status).toBe(401);
    });

    it("refuses a member creating one", async () => {
      const response = await member.fetch("/admin/integrations/bots", {
        method: "POST",
        body: JSON.stringify({ displayName: "Rogue", username: `rogue${unique()}` }),
      });
      expect(response.status).toBe(403);
    });
  });

  /* ---------------------------------------------------------------------- */

  describe("incoming webhooks", () => {
    let hookUrl = "";

    it("creates a webhook and posts through it with no session", async () => {
      const bot = (await admin
        .fetch("/admin/integrations/bots", {
          method: "POST",
          body: JSON.stringify({ displayName: "Alerts", username: `alerts${unique()}` }),
        })
        .then((r) => r.json())) as { bot: { id: string } };
      cleanupUsers.push(bot.bot.id);

      const created = await admin.fetch("/admin/integrations/incoming-webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: "Monitoring",
          channelId: "ch_general",
          botUserId: bot.bot.id,
        }),
      });
      expect(created.status).toBe(201);
      hookUrl = ((await created.json()) as { url: string }).url;
      expect(hookUrl).toContain("/api/v1/hooks/hlx_hook_");

      // No cookie, no bearer token — the URL is the credential.
      const posted = await fetch(hookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Disk usage above 90% on db-1" }),
      });
      expect(posted.status).toBe(201);

      const { messageId } = (await posted.json()) as { messageId: string };
      const { rows } = await db().query<{ body: string; author_id: string }>(
        `SELECT body, author_id FROM messages WHERE id = $1`,
        [messageId],
      );
      expect(rows[0].body).toBe("Disk usage above 90% on db-1");
      expect(rows[0].author_id).toBe(bot.bot.id);
    });

    it("answers 404 for an unknown secret, revealing nothing", async () => {
      const response = await fetch(`${BASE_URL}/api/v1/hooks/hlx_hook_madeupvalue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Should not land" }),
      });
      expect(response.status).toBe(404);
    });

    it("rejects an empty payload", async () => {
      const response = await fetch(hookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "" }),
      });
      expect(response.status).toBe(400);
    });
  });

  /* ---------------------------------------------------------------------- */

  describe("outgoing webhooks", () => {
    it("delivers a matching message, signed", async () => {
      const before = receiver.received.length;

      await admin.fetch("/admin/integrations/outgoing-webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: `test-${unique()}`,
          channelId: "ch_general",
          targetUrl: receiver.url,
          triggerWords: ["deploy"],
        }),
      });

      await admin.fetch("/channels/ch_general/messages", {
        method: "POST",
        body: JSON.stringify({ channelId: "ch_general", body: "deploy the release branch" }),
      });

      // Dispatch is detached from the response, so wait for it to land.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      expect(receiver.received.length).toBeGreaterThan(before);

      const delivery = receiver.received[receiver.received.length - 1];
      expect((delivery.body as { text: string }).text).toBe("deploy the release branch");
      expect(delivery.headers["x-helix-signature"]).toMatch(/^v0=[0-9a-f]{64}$/);
      expect(delivery.headers["x-helix-timestamp"]).toBeTruthy();
    });

    it("does not deliver a message that misses the trigger", async () => {
      const before = receiver.received.length;
      await admin.fetch("/channels/ch_general/messages", {
        method: "POST",
        body: JSON.stringify({ channelId: "ch_general", body: "nothing relevant here" }),
      });
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      expect(receiver.received.length).toBe(before);
    });
  });

  /* ---------------------------------------------------------------------- */

  describe("slash commands", () => {
    it("registers a command and runs it", async () => {
      const command = `weather${unique()}`;
      const created = await admin.fetch("/admin/integrations/slash-commands", {
        method: "POST",
        body: JSON.stringify({
          command,
          name: `test-${command}`,
          description: "Looks up the weather",
          targetUrl: receiver.url,
        }),
      });
      expect(created.status).toBe(201);

      receiver.reply = {
        status: 200,
        body: JSON.stringify({ responseType: "ephemeral", text: "It is raining." }),
      };

      const run = await member.fetch("/commands/run", {
        method: "POST",
        body: JSON.stringify({ channelId: "ch_general", command, text: "London" }),
      });
      expect(run.status).toBe(200);
      expect(await run.json()).toEqual({ responseType: "ephemeral", text: "It is raining." });

      const delivery = receiver.received[receiver.received.length - 1];
      expect((delivery.body as { text: string; command: string }).text).toBe("London");
      expect((delivery.body as { command: string }).command).toBe(`/${command}`);
    });

    it("refuses an unknown command", async () => {
      const response = await member.fetch("/commands/run", {
        method: "POST",
        body: JSON.stringify({ channelId: "ch_general", command: "nosuchcommand" }),
      });
      expect(response.status).toBe(404);
    });

    it("refuses to run a command in a channel the caller is not in", async () => {
      const response = await member.fetch("/commands/run", {
        method: "POST",
        // A channel this member is genuinely not in — the membership check must
        // fire before the command is even looked up.
        body: JSON.stringify({ channelId: "ch_frontend", command: "anything" }),
      });
      expect(response.status).toBe(403);
    });
  });

  /* ---------------------------------------------------------------------- */

  describe("OAuth 2.0 applications", () => {
    let clientId = "";
    let clientSecret = "";
    const redirectUri = "https://app.example.com/callback";

    const pkce = () => {
      const verifier = randomBytes(32).toString("base64url");
      return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
    };

    beforeAll(async () => {
      const created = (await admin
        .fetch("/admin/integrations/oauth-apps", {
          method: "POST",
          body: JSON.stringify({
            name: `test-app-${unique()}`,
            redirectUris: [redirectUri],
            scopes: ["messages:read", "messages:write"],
          }),
        })
        .then((r) => r.json())) as { clientId: string; clientSecret: string };
      clientId = created.clientId;
      clientSecret = created.clientSecret;
    });

    const authorize = async (challenge: string) => {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "messages:read",
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      return member.fetch(`/oauth/authorize?${params}`, { method: "POST" });
    };

    const exchange = (body: Record<string, string>) =>
      fetch(`${BASE_URL}/api/v1/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
      });

    it("shows what is being asked for before approval", async () => {
      const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: "messages:read" });
      const response = await member.fetch(`/oauth/authorize?${params}`);
      expect(response.status).toBe(200);
      const consent = (await response.json()) as { scopes: string[]; application: { name: string } };
      expect(consent.scopes).toEqual(["messages:read"]);
      expect(consent.application.name).toContain("test-app");
    });

    it("refuses a redirect URI that is not registered exactly", async () => {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: "https://app.example.com/callback/../evil",
      });
      expect((await member.fetch(`/oauth/authorize?${params}`)).status).toBe(400);
    });

    it("requires PKCE", async () => {
      const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri });
      const response = await member.fetch(`/oauth/authorize?${params}`, { method: "POST" });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe("pkce_required");
    });

    it("completes the code flow and the token acts as the person", async () => {
      const { verifier, challenge } = pkce();
      const { code } = (await authorize(challenge).then((r) => r.json())) as { code: string };

      const tokenResponse = await exchange({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      });
      expect(tokenResponse.status).toBe(200);

      const tokens = (await tokenResponse.json()) as { access_token: string; refresh_token: string };
      expect(tokens.access_token).toMatch(/^hlx_oat_/);

      const me = await fetch(`${BASE_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      expect(me.status).toBe(200);
      expect(((await me.json()) as { id: string }).id).toBe(member.userId);

      // Delegated access must not be able to seize the account.
      const takeover = await fetch(`${BASE_URL}/api/v1/users/me/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.access_token}` },
        body: JSON.stringify({ currentPassword: "x", newPassword: "an-even-longer-one" }),
      });
      expect(takeover.status).toBe(403);
    });

    it("refuses a code replayed a second time", async () => {
      const { verifier, challenge } = pkce();
      const { code } = (await authorize(challenge).then((r) => r.json())) as { code: string };
      const body = {
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      };

      expect((await exchange(body)).status).toBe(200);
      const replay = await exchange(body);
      expect(replay.status).toBe(400);
      expect(((await replay.json()) as { error: string }).error).toBe("invalid_grant");
    });

    it("refuses a code redeemed with the wrong verifier", async () => {
      const { challenge } = pkce();
      const { code } = (await authorize(challenge).then((r) => r.json())) as { code: string };

      const response = await exchange({
        grant_type: "authorization_code",
        code,
        code_verifier: randomBytes(32).toString("base64url"),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      });
      expect(response.status).toBe(400);
    });

    it("refuses a wrong client secret", async () => {
      const { verifier, challenge } = pkce();
      const { code } = (await authorize(challenge).then((r) => r.json())) as { code: string };

      const response = await exchange({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: clientId,
        client_secret: "hlx_cs_wrong",
        redirect_uri: redirectUri,
      });
      expect(response.status).toBe(401);
      expect(((await response.json()) as { error: string }).error).toBe("invalid_client");
    });

    it("rotates the refresh token, retiring the old one", async () => {
      const { verifier, challenge } = pkce();
      const { code } = (await authorize(challenge).then((r) => r.json())) as { code: string };
      const first = (await exchange({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).then((r) => r.json())) as { refresh_token: string };

      const refreshed = await exchange({
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      });
      expect(refreshed.status).toBe(200);

      // The old one must be dead now.
      const reuse = await exchange({
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      });
      expect(reuse.status).toBe(400);
    });
  });

  /* ---------------------------------------------------------------------- */

  describe("enable and disable", () => {
    it("stops an incoming webhook without deleting it", async () => {
      const bot = (await admin
        .fetch("/admin/integrations/bots", {
          method: "POST",
          body: JSON.stringify({ displayName: "Toggle", username: `toggle${unique()}` }),
        })
        .then((r) => r.json())) as { bot: { id: string } };
      cleanupUsers.push(bot.bot.id);

      const created = (await admin
        .fetch("/admin/integrations/incoming-webhooks", {
          method: "POST",
          body: JSON.stringify({
            name: "Toggleable",
            channelId: "ch_general",
            botUserId: bot.bot.id,
          }),
        })
        .then((r) => r.json())) as { id: string; url: string };

      const post = () =>
        fetch(created.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "still listening" }),
        });

      expect((await post()).status).toBe(201);

      expect(
        (
          await admin.fetch(`/admin/integrations/incoming-webhooks/${created.id}/enabled`, {
            method: "PUT",
            body: JSON.stringify({ isEnabled: false }),
          })
        ).status,
      ).toBe(204);

      // Disabled answers exactly as an unknown secret does, so the endpoint
      // still reveals nothing about which secrets exist.
      expect((await post()).status).toBe(404);

      // And the row survives, with its history and its secret.
      const list = (await admin
        .fetch("/admin/integrations/incoming-webhooks")
        .then((r) => r.json())) as { id: string; isEnabled: boolean; postCount: number }[];
      const row = list.find((entry) => entry.id === created.id);
      expect(row?.isEnabled).toBe(false);
      expect(row?.postCount).toBeGreaterThan(0);

      // Re-enabling restores it.
      await admin.fetch(`/admin/integrations/incoming-webhooks/${created.id}/enabled`, {
        method: "PUT",
        body: JSON.stringify({ isEnabled: true }),
      });
      expect((await post()).status).toBe(201);
    });

    it("hides a disabled command from the composer", async () => {
      const command = `toggled${unique()}`;
      const created = (await admin
        .fetch("/admin/integrations/slash-commands", {
          method: "POST",
          body: JSON.stringify({
            command,
            name: `test-${command}`,
            targetUrl: receiver.url,
          }),
        })
        .then((r) => r.json())) as { id: string };

      const offered = async () =>
        ((await member.fetch("/commands").then((r) => r.json())) as { command: string }[]).some(
          (entry) => entry.command === command,
        );

      expect(await offered()).toBe(true);

      await admin.fetch(`/admin/integrations/slash-commands/${created.id}/enabled`, {
        method: "PUT",
        body: JSON.stringify({ isEnabled: false }),
      });

      expect(await offered()).toBe(false);
      // And it cannot be run by typing it either.
      const run = await member.fetch("/commands/run", {
        method: "POST",
        body: JSON.stringify({ channelId: "ch_general", command }),
      });
      expect(run.status).toBe(404);
    });

    it("refuses a disabled OAuth application at the authorize endpoint", async () => {
      const app = (await admin
        .fetch("/admin/integrations/oauth-apps", {
          method: "POST",
          body: JSON.stringify({
            name: `test-off-${unique()}`,
            redirectUris: ["https://app.example.com/cb"],
            scopes: ["messages:read"],
          }),
        })
        .then((r) => r.json())) as { id: string; clientId: string };

      await admin.fetch(`/admin/integrations/oauth-apps/${app.id}/enabled`, {
        method: "PUT",
        body: JSON.stringify({ isEnabled: false }),
      });

      const params = new URLSearchParams({
        client_id: app.clientId,
        redirect_uri: "https://app.example.com/cb",
      });
      expect((await member.fetch(`/oauth/authorize?${params}`)).status).toBe(404);
    });

    it("refuses an ordinary member toggling anything", async () => {
      const list = (await admin
        .fetch("/admin/integrations/slash-commands")
        .then((r) => r.json())) as { id: string }[];
      const response = await member.fetch(
        `/admin/integrations/slash-commands/${list[0].id}/enabled`,
        { method: "PUT", body: JSON.stringify({ isEnabled: false }) },
      );
      expect(response.status).toBe(403);
    });
  });

  describe("outgoing OAuth connections", () => {
    it("stores the client secret encrypted, never in plaintext", async () => {
      const name = `test-conn-${unique()}`;
      const secret = `super-secret-${unique()}`;

      const response = await admin.fetch("/admin/integrations/oauth-connections", {
        method: "POST",
        body: JSON.stringify({
          name,
          provider: "GitHub",
          clientId: "gh_client",
          clientSecret: secret,
          authorizeUrl: "https://github.com/login/oauth/authorize",
          tokenUrl: "https://github.com/login/oauth/access_token",
          scopes: ["repo"],
        }),
      });
      expect(response.status).toBe(201);

      const { rows } = await db().query<{ client_secret_enc: string }>(
        `SELECT client_secret_enc FROM outgoing_oauth_connections WHERE name = $1`,
        [name],
      );
      expect(rows[0].client_secret_enc).not.toContain(secret);
      expect(rows[0].client_secret_enc).toMatch(/^v1\./);

      // The listing must not carry it either.
      const list = await admin.fetch("/admin/integrations/oauth-connections").then((r) => r.text());
      expect(list).not.toContain(secret);
    });

    it("builds an authorize URL with a state it generated itself", async () => {
      const list = (await admin
        .fetch("/admin/integrations/oauth-connections")
        .then((r) => r.json())) as { id: string; name: string }[];
      const connection = list.find((entry) => entry.name.startsWith("test-conn-"));

      const response = await admin.fetch(
        `/admin/integrations/oauth-connections/${connection?.id}/authorize`,
      );
      expect(response.status).toBe(200);

      const { authorizeUrl } = (await response.json()) as { authorizeUrl: string };
      const url = new URL(authorizeUrl);
      expect(url.origin).toBe("https://github.com");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("state")).toBeTruthy();
    });

    it("refuses a callback whose state it did not issue", async () => {
      const list = (await admin
        .fetch("/admin/integrations/oauth-connections")
        .then((r) => r.json())) as { id: string; name: string }[];
      const connection = list.find((entry) => entry.name.startsWith("test-conn-"));

      const response = await admin.fetch(
        `/admin/integrations/oauth-connections/${connection?.id}/callback?code=abc&state=forged`,
      );
      expect(response.status).toBe(400);
      expect(((await response.json()) as { code: string }).code).toBe("invalid_state");
    });
  });
});
