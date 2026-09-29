import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

/**
 * Saving permission edits in one go. The confirmation lists N changes and
 * promises they all happen; this holds the server to that.
 */
describe("saving permission changes", () => {
  let admin: Client;
  let member: Client;
  let snapshot: { role_id: string; permission_id: string }[] = [];
  /**
   * A role this suite creates and owns, rather than a seeded one. The first
   * version used the seeded Moderator, and failed the moment someone deleted
   * Moderator through the UI — a test must not depend on data anyone can remove.
   */
  let scratchRole = "";

  beforeAll(async () => {
    await assertServerRunning();
    admin = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
    const created = (await admin
      .fetch("/admin/roles", {
        method: "POST",
        body: JSON.stringify({ name: `test-role-save-${Date.now()}`, copyFromRoleId: "role_member" }),
      })
      .then((r) => r.json())) as { id: string };
    scratchRole = created.id;

    // Guest is seeded and shared: capture it so it can be put back exactly.
    snapshot = (
      await db().query<{ role_id: string; permission_id: string }>(
        `SELECT role_id, permission_id FROM role_permissions WHERE role_id = 'role_guest'`,
      )
    ).rows;
  });

  afterAll(async () => {
    await db().query(`DELETE FROM roles WHERE id = $1`, [scratchRole]);
    await db().query(`DELETE FROM role_permissions WHERE role_id = 'role_guest'`);
    for (const row of snapshot) {
      await db().query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)`, [
        row.role_id,
        row.permission_id,
      ]);
    }
    await closeDb();
  });

  const has = async (roleId: string, permissionId: string) =>
    (
      await db().query(`SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2`, [
        roleId,
        permissionId,
      ])
    ).rows.length > 0;

  const save = (changes: unknown[]) =>
    admin.fetch("/admin/permissions", { method: "PUT", body: JSON.stringify({ changes }) });

  const somePermissions = async () =>
    (await db().query<{ id: string }>(`SELECT id FROM permissions ORDER BY id LIMIT 3`)).rows.map(
      (row) => row.id,
    );

  it("applies several grants and removals together", async () => {
    const [a, b] = await somePermissions();
    const hadA = await has("role_guest", a);
    const hadB = await has(scratchRole, b);

    const response = await save([
      { roleId: "role_guest", permissionId: a, granted: !hadA },
      { roleId: scratchRole, permissionId: b, granted: !hadB },
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ applied: 2 });

    expect(await has("role_guest", a)).toBe(!hadA);
    expect(await has(scratchRole, b)).toBe(!hadB);
  });

  it("applies nothing when any one change is invalid", async () => {
    const [a] = await somePermissions();
    const before = await has("role_guest", a);

    // The first change is valid; the second names a permission that does not
    // exist. Both must be refused, or the Save would half-happen.
    const response = await save([
      { roleId: "role_guest", permissionId: a, granted: !before },
      { roleId: "role_guest", permissionId: "p_does_not_exist", granted: true },
    ]);
    expect(response.status).toBe(422);
    expect(await has("role_guest", a)).toBe(before);
  });

  it("refuses the whole batch if it touches the owner role", async () => {
    const [a] = await somePermissions();
    const before = await has("role_guest", a);

    const response = await save([
      { roleId: "role_guest", permissionId: a, granted: !before },
      { roleId: "role_owner", permissionId: a, granted: false },
    ]);
    expect(response.status).toBe(403);
    // Including the change that was fine on its own.
    expect(await has("role_guest", a)).toBe(before);
  });

  it("refuses an unknown role", async () => {
    const [a] = await somePermissions();
    const response = await save([{ roleId: "role_nope", permissionId: a, granted: true }]);
    expect(response.status).toBe(422);
  });

  it("refuses an empty save", async () => {
    expect((await save([])).status).toBe(400);
  });

  it("refuses an ordinary member", async () => {
    const [a] = await somePermissions();
    const response = await member.fetch("/admin/permissions", {
      method: "PUT",
      body: JSON.stringify({ changes: [{ roleId: "role_guest", permissionId: a, granted: true }] }),
    });
    expect(response.status).toBe(403);
  });

  it("audits each change, like a single toggle would", async () => {
    const [, , c] = await somePermissions();
    const had = await has("role_guest", c);
    await save([{ roleId: "role_guest", permissionId: c, granted: !had }]);

    const { rows } = await db().query<{ action: string; target: string }>(
      `SELECT action, target FROM audit_log WHERE target LIKE $1 ORDER BY created_at DESC LIMIT 1`,
      [`role_guest % ${c}`],
    );
    expect(rows[0]?.action).toBe(had ? "role.permission_revoked" : "role.permission_granted");
  });
});
