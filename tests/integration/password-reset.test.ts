import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, BASE_URL, closeDb, db, DEMO_PASSWORD, signIn, type Client } from "./helpers";

/**
 * An administrator resetting a password is, in effect, signing in as that
 * person — so most of these tests are about who is *refused*. Every account
 * reset here is a throwaway created by the suite; no real person's password is
 * ever touched.
 */
describe("administrator password reset", () => {
  const tag = Date.now().toString(36);
  const PASSWORD = "an-original-password";
  let owner: Client;
  let admin: Client; // Alice
  let member: Client; // Bob
  let victim: { id: string; email: string };
  let victimAdmin: { id: string; email: string };

  const create = async (kind: string, roleId: string) => {
    const email = `reset-victim-${kind}-${tag}@example.com`;
    const response = await owner.fetch("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email, fullName: `Reset ${kind}`, password: PASSWORD, username: `reset.${kind}.${tag}`, roleId, channels: [],
      }),
    });
    expect(response.status).toBe(201);
    return { id: ((await response.json()) as { id: string }).id, email };
  };

  const reset = (client: Client, id: string) => client.fetch(`/admin/users/${id}/password`, { method: "POST" });
  const login = (email: string, password: string) =>
    fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, workspace: "northwind" }),
    });

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
    admin = await signIn(ACCOUNTS.admin);
    member = await signIn(ACCOUNTS.member);
    victim = await create("member", "role_member");
    victimAdmin = await create("admin", "role_admin");
  });

  afterAll(async () => {
    await db().query(`DELETE FROM users WHERE email LIKE 'reset-victim-%-${tag}@example.com'`);
    await closeDb();
  });

  it("gives a working temporary password, ends the old one and every session", async () => {
    const before = await signIn(victim.email, PASSWORD);
    expect((await before.fetch("/auth/me")).status).toBe(200);

    const response = await reset(await signIn(ACCOUNTS.owner), victim.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { password } = (await response.json()) as { password: string };
    expect(password).toMatch(/^[A-Za-z0-9]{16}$/);

    expect((await login(victim.email, PASSWORD)).status).toBe(401);
    expect((await login(victim.email, password)).status).toBe(200);
    // The session they had before the reset is gone.
    expect((await before.fetch("/auth/me")).status).toBe(401);
  });

  it("chooses a different password every time", async () => {
    const client = await signIn(ACCOUNTS.owner);
    const first = ((await (await reset(client, victim.id)).json()) as { password: string }).password;
    const second = ((await (await reset(client, victim.id)).json()) as { password: string }).password;
    expect(first).not.toBe(second);
  });

  it("is recorded, without the password", async () => {
    const { password } = (await (await reset(await signIn(ACCOUNTS.owner), victim.id)).json()) as { password: string };
    const row = await db().query<{ target: string; severity: string }>(
      `SELECT target, severity FROM audit_log WHERE action = 'user.password_reset' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(row.rows[0].target).toContain(`@reset.member.${tag}`);
    expect(row.rows[0].target).not.toContain(password);
    expect(row.rows[0].severity).toBe("critical");
  });

  it("is refused to a member", async () => {
    expect((await reset(member, victim.id)).status).toBe(403);
  });

  it("is refused for yourself, a bot and someone who does not exist", async () => {
    const client = await signIn(ACCOUNTS.owner);
    expect((await reset(client, owner.userId)).status).toBe(400);
    expect((await reset(client, "u_deploybot")).status).toBe(422);
    expect((await reset(client, "u_does_not_exist")).status).toBe(404);
  });

  it("lets an administrator reset a member, but never an owner or another administrator", async () => {
    const alice = await signIn(ACCOUNTS.admin);
    expect((await reset(alice, victim.id)).status).toBe(200);
    // Resetting the owner's password would be signing in as the owner.
    expect((await reset(alice, owner.userId)).status).toBe(403);
    expect((await reset(alice, victimAdmin.id)).status).toBe(403);
    // …and the refused ones are unchanged.
    expect((await login(victimAdmin.email, PASSWORD)).status).toBe(200);
    expect((await login(ACCOUNTS.owner, DEMO_PASSWORD)).status).toBe(200);
  });

  it("lets an owner reset an administrator", async () => {
    expect((await reset(await signIn(ACCOUNTS.owner), victimAdmin.id)).status).toBe(200);
    expect((await login(victimAdmin.email, PASSWORD)).status).toBe(401);
  });
});
