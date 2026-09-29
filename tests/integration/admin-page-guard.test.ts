import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, BASE_URL, closeDb, db, signIn, type Client } from "./helpers";

/**
 * The Administration pages used to load for anyone signed in — a member got the
 * admin shell with every panel failing. The API always refused them; the page
 * now does too.
 */
describe("administration pages", () => {
  const tag = Date.now().toString(36);
  let owner: Client;
  let admin: Client;
  let member: Client;
  let roleId = "";
  let scoped: Client | undefined;

  const open = (path: string, cookie?: string) =>
    fetch(`${BASE_URL}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const where = (response: Response) => new URL(response.headers.get("location") ?? "", BASE_URL).pathname;

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
    admin = await signIn(ACCOUNTS.admin);
    member = await signIn(ACCOUNTS.member);
  });

  afterAll(async () => {
    await db().query(`DELETE FROM users WHERE email = $1`, [`guard-${tag}@example.com`]);
    if (roleId) await db().query(`DELETE FROM roles WHERE id = $1`, [roleId]);
    await closeDb();
  });

  it("sends a signed-out visitor to sign in", async () => {
    const response = await open("/admin");
    expect(response.status).toBe(307);
    expect(where(response)).toBe("/login");
  });

  it("sends an ordinary member back to the workspace, on every admin page", async () => {
    for (const path of ["/admin", "/admin/users", "/admin/system", "/admin/audit-log"]) {
      const response = await open(path, member.cookie);
      expect(response.status, path).toBe(307);
      expect(where(response), path).toBe("/workspace");
    }
  });

  it("lets owners and administrators in", async () => {
    expect((await open("/admin", owner.cookie)).status).toBe(200);
    expect((await open("/admin/users", admin.cookie)).status).toBe(200);
  });

  it("goes by permissions, not by role name", async () => {
    // A custom role holding one admin permission is enough to open the area…
    const created = await owner.fetch("/admin/roles", {
      method: "POST",
      body: JSON.stringify({ name: `Auditor ${tag}`, description: "" }),
    });
    roleId = ((await created.json()) as { id: string }).id;
    await owner.fetch("/admin/permissions", {
      method: "PUT",
      body: JSON.stringify({ changes: [{ roleId, permissionId: "p_admin_audit", granted: true }] }),
    });
    const email = `guard-${tag}@example.com`;
    const person = await owner.fetch("/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, fullName: "Guard Test", password: "a-long-enough-password", username: `guard.${tag}`, roleId, channels: [] }),
    });
    expect(person.status).toBe(201);
    scoped = await signIn(email, "a-long-enough-password");
    expect((await open("/admin", scoped.cookie)).status).toBe(200);

    // …and without it, the same person is turned away.
    await owner.fetch("/admin/permissions", {
      method: "PUT",
      body: JSON.stringify({ changes: [{ roleId, permissionId: "p_admin_audit", granted: false }] }),
    });
    expect((await open("/admin", scoped.cookie)).status).toBe(307);
  });
});
