import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, BASE_URL, cache, closeCache, closeDb, db, DEMO_PASSWORD, signIn, type Client } from "./helpers";

/**
 * Session length used to be a control that saved nothing: the setting existed,
 * and every session got the environment's 30 days regardless. It is restored to
 * what it was afterwards, since this shares a database with a real workspace.
 */
describe("session length", () => {
  let owner: Client;
  let member: Client;
  let original: number | undefined;

  const setHours = (hours: unknown) =>
    owner.fetch("/admin/settings", { method: "PATCH", body: JSON.stringify({ sessionTimeoutHours: hours }) });

  const signInRaw = async () => {
    const response = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ACCOUNTS.member, password: DEMO_PASSWORD, workspace: "northwind" }),
    });
    const body = (await response.json()) as { accessToken: string; expiresAt: string };
    const maxAge = Number(/Max-Age=(\d+)/i.exec(response.headers.get("set-cookie") ?? "")?.[1]);
    return { sessionId: body.accessToken, expiresAt: new Date(body.expiresAt).getTime(), maxAge };
  };
  const hoursFromNow = (ms: number) => (ms - Date.now()) / 3_600_000;

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
    original = ((await (await owner.fetch("/admin/settings")).json()) as { sessionTimeoutHours?: number }).sessionTimeoutHours;
  });

  afterAll(async () => {
    if (original) await setHours(original);
    await closeCache();
    await closeDb();
  });

  it("gives a new sign-in the workspace's length, in the response, cookie, database and Redis", async () => {
    expect((await setHours(24)).status).toBe(204);
    const session = await signInRaw();

    expect(hoursFromNow(session.expiresAt)).toBeGreaterThan(23.9);
    expect(hoursFromNow(session.expiresAt)).toBeLessThan(24.1);
    expect(session.maxAge).toBe(24 * 3600);

    const stored = await db().query<{ expires_at: Date }>(`SELECT expires_at FROM sessions WHERE id = $1`, [session.sessionId]);
    expect(hoursFromNow(stored.rows[0].expires_at.getTime())).toBeLessThan(24.1);
    const ttl = await cache().ttl(`session:${session.sessionId}`);
    expect(ttl).toBeGreaterThan(24 * 3600 - 60);
    expect(ttl).toBeLessThanOrEqual(24 * 3600);
  });

  it("changes only later sign-ins, never one already open", async () => {
    await setHours(24);
    const before = await signInRaw();
    await setHours(168);
    const after = await signInRaw();

    expect(hoursFromNow(after.expiresAt)).toBeGreaterThan(167.9);
    const untouched = await db().query<{ expires_at: Date }>(`SELECT expires_at FROM sessions WHERE id = $1`, [before.sessionId]);
    expect(untouched.rows[0].expires_at.getTime()).toBe(before.expiresAt);
  });

  it("refuses lengths that are not a whole number of hours between 1 and 8760", async () => {
    for (const bad of [0, -5, 8_761, 1.5, "abc", null]) {
      expect((await setHours(bad)).status, String(bad)).toBe(400);
    }
  });

  it("is for administrators only", async () => {
    const response = await member.fetch("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ sessionTimeoutHours: 1 }),
    });
    expect(response.status).toBe(403);
  });
});
