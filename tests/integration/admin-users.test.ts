import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

const PASSWORD = "a-long-enough-password";

describe("creating an account", () => {
  let admin: Client;
  let member: Client;
  const created: string[] = [];

  beforeAll(async () => {
    await assertServerRunning();
    admin = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
  });

  afterAll(async () => {
    if (created.length) {
      await db().query(`DELETE FROM users WHERE id = ANY($1::text[])`, [created]);
    }
    await closeDb();
  });

  const create = async (client: Client, body: Record<string, unknown>) => {
    const response = await client.fetch("/admin/users", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const payload = response.status === 201 ? await response.json() : await response.json();
    if (payload?.id) created.push(payload.id as string);
    return { response, payload };
  };

  const unique = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  it("refuses an ordinary member", async () => {
    const { response } = await create(member, {
      email: `nope-${unique()}@northwind.io`,
      fullName: "Should Not Exist",
      password: PASSWORD,
    });
    expect(response.status).toBe(403);
  });

  it("creates an account the new person can sign in with", async () => {
    const email = `ada-${unique()}@northwind.io`;
    const { response, payload } = await create(admin, {
      email,
      fullName: "Ada Lovelace",
      password: PASSWORD,
      channels: ["general"],
    });

    expect(response.status).toBe(201);
    expect(payload.email).toBe(email);
    expect(payload.username).toBe("ada.lovelace");

    // The point of the feature: they can actually get in.
    const theirs = await signIn(email, PASSWORD);
    expect(theirs.userId).toBe(payload.id);

    const channels = (await theirs
      .fetch("/workspaces/ws_northwind/channels")
      .then((r) => r.json())) as { name: string }[];
    expect(channels.map((channel) => channel.name)).toContain("general");
  });

  it("never returns the password", async () => {
    const { payload } = await create(admin, {
      email: `quiet-${unique()}@northwind.io`,
      fullName: "Quiet Person",
      password: PASSWORD,
    });
    expect(JSON.stringify(payload)).not.toContain(PASSWORD);
    expect(payload).not.toHaveProperty("passwordHash");
  });

  it("refuses a duplicate email and says so", async () => {
    const { response, payload } = await create(admin, {
      email: ACCOUNTS.member,
      fullName: "Bob Again",
      password: PASSWORD,
    });
    expect(response.status).toBe(409);
    expect(payload.code).toBe("email_taken");
  });

  it("refuses a taken username separately from a taken email", async () => {
    const { response, payload } = await create(admin, {
      email: `fresh-${unique()}@northwind.io`,
      fullName: "Someone Else",
      // `bob` already exists, so the address is free but the handle is not.
      username: "bob",
      password: PASSWORD,
    });
    expect(response.status).toBe(409);
    expect(payload.code).toBe("username_taken");
  });

  it("refuses a role that does not exist", async () => {
    const { response, payload } = await create(admin, {
      email: `ghost-${unique()}@northwind.io`,
      fullName: "Ghost Role",
      password: PASSWORD,
      roleId: "role_does_not_exist",
    });
    expect(response.status).toBe(422);
    expect(payload.code).toBe("unknown_role");
  });

  it("refuses a channel that does not exist", async () => {
    const { response, payload } = await create(admin, {
      email: `lost-${unique()}@northwind.io`,
      fullName: "Lost Channel",
      password: PASSWORD,
      channels: ["general", "no-such-channel"],
    });
    expect(response.status).toBe(422);
    expect(payload.code).toBe("unknown_channels");
  });

  it("rejects a password below the minimum", async () => {
    const { response } = await create(admin, {
      email: `short-${unique()}@northwind.io`,
      fullName: "Short Password",
      password: "tiny",
    });
    expect(response.status).toBe(400);
  });

  it("writes nothing when it refuses", async () => {
    const email = `atomic-${unique()}@northwind.io`;
    await create(admin, {
      email,
      fullName: "Atomic Person",
      password: PASSWORD,
      channels: ["no-such-channel"],
    });

    const { rows } = await db().query(`SELECT id FROM users WHERE email = $1`, [email]);
    expect(rows).toHaveLength(0);
  });

  it("records the creation in the audit log", async () => {
    const email = `audited-${unique()}@northwind.io`;
    await create(admin, { email, fullName: "Audited Person", password: PASSWORD });

    const { rows } = await db().query<{ action: string; target: string }>(
      `SELECT action, target FROM audit_log WHERE action = 'user.created'
       ORDER BY created_at DESC LIMIT 1`,
    );
    expect(rows[0]?.target).toContain(email);
  });
});
