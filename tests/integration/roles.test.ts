import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

/** A spare account whose role this suite moves around and then restores. */
const SUBJECT = "u_dir_1";

describe("creating and deleting roles", () => {
  let admin: Client;
  let member: Client;
  let originalRole = "";

  beforeAll(async () => {
    await assertServerRunning();
    admin = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
    originalRole = (
      await db().query<{ role_id: string }>(`SELECT role_id FROM users WHERE id = $1`, [SUBJECT])
    ).rows[0].role_id;
  });

  afterAll(async () => {
    // Put the subject back exactly where it was, and remove anything left over.
    await db().query(`UPDATE users SET role_id = $2 WHERE id = $1`, [SUBJECT, originalRole]);
    await db().query(`DELETE FROM roles WHERE name LIKE 'test-role-%'`);
    await closeDb();
  });

  const unique = () => `test-role-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  const create = (body: Record<string, unknown>) =>
    admin.fetch("/admin/roles", { method: "POST", body: JSON.stringify(body) });

  it("creates a role, starting from another role's permissions", async () => {
    const response = await create({ name: unique(), copyFromRoleId: "role_member" });
    expect(response.status).toBe(201);

    const role = (await response.json()) as { permissionIds: string[]; isSystem: boolean };
    const { rows } = await db().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM role_permissions WHERE role_id = 'role_member'`,
    );
    expect(role.permissionIds.length).toBe(Number(rows[0].n));
    // A role an administrator made is never a built-in one.
    expect(role.isSystem).toBe(false);
  });

  it("creates an empty role when asked to start from nothing", async () => {
    const role = (await create({ name: unique(), copyFromRoleId: null }).then((r) => r.json())) as {
      permissionIds: string[];
    };
    expect(role.permissionIds).toEqual([]);
  });

  it("refuses a name already taken, ignoring case", async () => {
    const name = unique();
    await create({ name });
    const again = await create({ name: name.toUpperCase() });
    expect(again.status).toBe(409);
  });

  it("refuses an ordinary member", async () => {
    const response = await member.fetch("/admin/roles", {
      method: "POST",
      body: JSON.stringify({ name: unique() }),
    });
    expect(response.status).toBe(403);
  });

  it("refuses to delete a built-in role", async () => {
    for (const roleId of ["role_member", "role_admin", "role_owner"]) {
      const response = await admin.fetch(`/admin/roles/${roleId}`, { method: "DELETE" });
      expect(response.status).toBe(409);
    }
  });

  it("moves members to Member instead of leaving them roleless", async () => {
    const role = (await create({ name: unique(), copyFromRoleId: "role_member" }).then((r) =>
      r.json(),
    )) as { id: string };
    await db().query(`UPDATE users SET role_id = $2 WHERE id = $1`, [SUBJECT, role.id]);

    const response = await admin.fetch(`/admin/roles/${role.id}`, { method: "DELETE" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ movedMembers: 1, movedTo: "role_member" });

    // The point of the feature: users.role_id has no foreign key, so without
    // the move this person would silently point at a role that is gone.
    const { rows } = await db().query<{ role_id: string }>(
      `SELECT role_id FROM users WHERE id = $1`,
      [SUBJECT],
    );
    expect(rows[0].role_id).toBe("role_member");

    // The audit names who moved. A count alone made a deletion impossible to
    // reconstruct from the log — which is exactly what was needed the first
    // time a real role was deleted.
    const username = (
      await db().query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [SUBJECT])
    ).rows[0].username;
    const audit = await db().query<{ target: string }>(
      `SELECT target FROM audit_log WHERE action = 'role.deleted' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(audit.rows[0].target).toContain(`@${username}`);
  });

  it("leaves nobody pointing at a role that does not exist", async () => {
    const { rows } = await db().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM users u
        WHERE u.role_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = u.role_id)`,
    );
    expect(rows[0].n).toBe("0");
  });

  it("removes the role's permission grants with it", async () => {
    const role = (await create({ name: unique(), copyFromRoleId: "role_member" }).then((r) =>
      r.json(),
    )) as { id: string };
    await admin.fetch(`/admin/roles/${role.id}`, { method: "DELETE" });

    const { rows } = await db().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM role_permissions WHERE role_id = $1`,
      [role.id],
    );
    expect(rows[0].n).toBe("0");
  });

  it("answers 404 for a role that does not exist", async () => {
    const response = await admin.fetch("/admin/roles/role_nope", { method: "DELETE" });
    expect(response.status).toBe(404);
  });

  it("records the deletion in the audit log as critical", async () => {
    const name = unique();
    const role = (await create({ name }).then((r) => r.json())) as { id: string };
    await admin.fetch(`/admin/roles/${role.id}`, { method: "DELETE" });

    const { rows } = await db().query<{ severity: string; target: string }>(
      `SELECT severity, target FROM audit_log WHERE action = 'role.deleted'
        ORDER BY created_at DESC LIMIT 1`,
    );
    expect(rows[0].severity).toBe("critical");
    expect(rows[0].target).toContain(name);
  });
});
