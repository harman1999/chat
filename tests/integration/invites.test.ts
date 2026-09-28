import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, BASE_URL, closeDb, db, signIn, type Client } from "./helpers";

const PASSWORD = "a-long-enough-password";

describe("invite links", () => {
  let admin: Client;
  let member: Client;

  beforeAll(async () => {
    await assertServerRunning();
    admin = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
  });

  afterAll(async () => {
    await db().query(`DELETE FROM users WHERE email LIKE 'invitee-%@example.com'`);
    await db().query(`DELETE FROM invite_links WHERE created_by = 'u_harman'`);
    await closeDb();
  });

  const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tokenOf = (url: string) => url.split("/join/")[1];

  const createLink = async (body: Record<string, unknown> = {}) => {
    const response = await admin.fetch("/invites", { method: "POST", body: JSON.stringify(body) });
    return { response, body: (await response.json()) as { url: string; link: { id: string } } };
  };

  /** Anonymous — the person opening an invite has no account. */
  const accept = (token: string, email = `invitee-${unique()}@example.com`) =>
    fetch(`${BASE_URL}/api/v1/join/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "New Person", email, password: PASSWORD }),
    });

  const preview = (token: string) => fetch(`${BASE_URL}/api/v1/join/${token}`);

  it("creates a link and shows its URL once", async () => {
    const { response, body } = await createLink({ expiresInDays: 7, maxUses: 5 });
    expect(response.status).toBe(201);
    expect(body.url).toContain("/join/hlx_inv_");

    // The listing never carries the token again.
    const list = await admin.fetch("/invites").then((r) => r.text());
    expect(list).not.toContain(tokenOf(body.url));
  });

  it("stores the token as a hash, never in plaintext", async () => {
    const { body } = await createLink();
    const { rows } = await db().query<{ token_hash: string }>(
      `SELECT token_hash FROM invite_links WHERE id = $1`,
      [body.link.id],
    );
    expect(rows[0].token_hash).not.toBe(tokenOf(body.url));
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses an ordinary member", async () => {
    const response = await member.fetch("/invites", { method: "POST", body: "{}" });
    expect(response.status).toBe(403);
  });

  it("previews a valid link without an account", async () => {
    const { body } = await createLink();
    const response = await preview(tokenOf(body.url));
    expect(response.status).toBe(200);
    const shown = (await response.json()) as { workspaceName: string; invitedByName: string };
    // Read, not hardcoded: the workspace can be renamed from the app.
    const current = await db().query<{ name: string }>(`SELECT name FROM workspaces WHERE id = 'ws_northwind'`);
    expect(shown.workspaceName).toBe(current.rows[0].name);
    expect(shown.invitedByName).toBeTruthy();
  });

  it("joins as a Member, lands in #general, and is signed straight in", async () => {
    const { body } = await createLink();
    const email = `invitee-${unique()}@example.com`;
    const response = await accept(tokenOf(body.url), email);
    expect(response.status).toBe(201);

    const { rows } = await db().query<{ role_id: string; id: string }>(
      `SELECT role_id, id FROM users WHERE email = $1`,
      [email],
    );
    // Never more than Member: a leaked link must not be a privilege escalation.
    expect(rows[0].role_id).toBe("role_member");

    const inGeneral = await db().query(
      `SELECT 1 FROM channel_members WHERE channel_id = 'ch_general' AND user_id = $1`,
      [rows[0].id],
    );
    expect(inGeneral.rows.length).toBe(1);

    // The response set a session cookie that works.
    const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
    const me = await fetch(`${BASE_URL}/api/v1/auth/me`, { headers: { cookie } });
    expect(me.status).toBe(200);
  });

  it("admits exactly one person on a one-use link, even when two submit at once", async () => {
    const { body } = await createLink({ maxUses: 1 });
    const token = tokenOf(body.url);

    const results = await Promise.all([accept(token), accept(token), accept(token)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);

    const { rows } = await db().query<{ use_count: number }>(
      `SELECT use_count FROM invite_links WHERE id = $1`,
      [body.link.id],
    );
    expect(rows[0].use_count).toBe(1);
  });

  it("says a used-up link is used up, rather than just refusing", async () => {
    const { body } = await createLink({ maxUses: 1 });
    await accept(tokenOf(body.url));
    const response = await preview(tokenOf(body.url));
    expect(response.status).toBe(410);
    expect(((await response.json()) as { code: string }).code).toBe("used_up");
  });

  it("does not burn a use when the signup itself fails", async () => {
    const { body } = await createLink({ maxUses: 1 });
    // An address that already has an account.
    const refused = await accept(tokenOf(body.url), ACCOUNTS.member);
    expect(refused.status).toBe(409);

    const { rows } = await db().query<{ use_count: number }>(
      `SELECT use_count FROM invite_links WHERE id = $1`,
      [body.link.id],
    );
    expect(rows[0].use_count).toBe(0);
    // And the single place is still there for the right person.
    expect((await accept(tokenOf(body.url))).status).toBe(201);
  });

  it("stops working the moment it is revoked", async () => {
    const { body } = await createLink();
    expect(
      (await admin.fetch(`/invites/${body.link.id}`, { method: "DELETE" })).status,
    ).toBe(204);

    const response = await accept(tokenOf(body.url));
    expect(response.status).toBe(410);
    expect(((await response.json()) as { code: string }).code).toBe("revoked");
  });

  it("refuses an expired link", async () => {
    const { body } = await createLink();
    await db().query(
      `UPDATE invite_links SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [body.link.id],
    );
    const response = await accept(tokenOf(body.url));
    expect(response.status).toBe(410);
    expect(((await response.json()) as { code: string }).code).toBe("expired");
  });

  it("refuses a token that does not exist", async () => {
    const response = await preview("hlx_inv_made-up-value");
    expect(response.status).toBe(410);
    expect(((await response.json()) as { code: string }).code).toBe("not_found");
  });

  it("lets two people with the same name both join", async () => {
    // The join form has no username field, so a clash has to be resolved for
    // them — the second Ada becomes ada.lovelace2, not a refusal.
    const { body } = await createLink({ maxUses: 5 });
    const token = tokenOf(body.url);
    const join = (email: string) =>
      fetch(`${BASE_URL}/api/v1/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Same Name", email, password: PASSWORD }),
      });

    const first = `invitee-${unique()}@example.com`;
    const second = `invitee-${unique()}@example.com`;
    expect((await join(first)).status).toBe(201);
    expect((await join(second)).status).toBe(201);

    const { rows } = await db().query<{ username: string }>(
      `SELECT username FROM users WHERE email = ANY($1::text[]) ORDER BY created_at`,
      [[first, second]],
    );
    expect(new Set(rows.map((row) => row.username)).size).toBe(2);
  });

  it("refuses a password below the minimum", async () => {
    const { body } = await createLink();
    const response = await fetch(`${BASE_URL}/api/v1/join/${tokenOf(body.url)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: "X", email: `invitee-${unique()}@example.com`, password: "short" }),
    });
    expect(response.status).toBe(400);
  });

  it("drops revoked and used-up links from the active list", async () => {
    const { body: revoked } = await createLink();
    await admin.fetch(`/invites/${revoked.link.id}`, { method: "DELETE" });
    const { body: usedUp } = await createLink({ maxUses: 1 });
    await accept(tokenOf(usedUp.url));

    const active = (await admin.fetch("/invites").then((r) => r.json())) as { id: string }[];
    const ids = active.map((link) => link.id);
    expect(ids).not.toContain(revoked.link.id);
    expect(ids).not.toContain(usedUp.link.id);
  });
});

describe("your own permissions", () => {
  beforeAll(assertServerRunning);
  afterAll(closeDb);

  it("tells an admin they can invite, and a member that they cannot", async () => {
    const admin = await signIn(ACCOUNTS.owner);
    const member = await signIn(ACCOUNTS.member);
    const theirs = async (c: Client) => (await c.fetch("/me/permissions").then((r) => r.json())) as string[];

    expect(await theirs(admin)).toContain("p_user_invite");
    expect(await theirs(member)).not.toContain("p_user_invite");
  });
});
