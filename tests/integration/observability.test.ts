import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNTS,
  assertServerRunning,
  clearRateLimit,
  closeCache,
  closeDb,
  db,
  signIn,
  type Client,
} from "./helpers";

interface Metrics {
  startedAt: string;
  uptimeSeconds: number;
  counters: { name: string; label: string; count: number }[];
  redisReachable: boolean;
  lastAuditAt: string | null;
  rateLimitingEffective: boolean;
}

describe("observability", () => {
  let admin: Client;
  let member: Client;

  beforeAll(async () => {
    await assertServerRunning();
    admin = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
  });

  afterAll(async () => {
    await closeCache();
    await closeDb();
  });

  const read = () => admin.fetch("/admin/metrics").then((r) => r.json() as Promise<Metrics>);

  const countOf = (metrics: Metrics, name: string, label?: string) =>
    metrics.counters
      .filter((c) => c.name === name && (label === undefined || c.label === label))
      .reduce((total, c) => total + c.count, 0);

  it("is admin-only", async () => {
    expect((await member.fetch("/admin/metrics")).status).toBe(403);
  });

  it("reports the rate limiter as effective while Redis is reachable", async () => {
    const metrics = await read();
    expect(metrics.redisReachable).toBe(true);
    expect(metrics.rateLimitingEffective).toBe(true);
    expect(countOf(metrics, "ratelimit.degraded")).toBe(0);
  });

  it("counts allowed requests against the rule that admitted them", async () => {
    const before = countOf(await read(), "ratelimit.allowed", "search");
    await admin.fetch("/search?q=payment");
    const after = countOf(await read(), "ratelimit.allowed", "search");

    expect(after).toBeGreaterThan(before);
  });

  it("counts a rejection when a limit actually bites", async () => {
    const before = countOf(await read(), "ratelimit.rejected", "login:account");

    // Only failed sign-ins are counted, so this spends the account bucket
    // without touching a real session.
    const email = "nils.haddad@northwind.io";
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await fetch(`${process.env.TEST_BASE_URL ?? "http://localhost:3000"}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "definitely-wrong" }),
      });
    }

    const after = countOf(await read(), "ratelimit.rejected", "login:account");
    expect(after).toBeGreaterThan(before);

    // Leave the bucket clear. A spent window outlives the test run, so
    // without this the account stays locked out for the next one.
    await clearRateLimit("login:account", `account:${email}`);
  });

  it("records the audit entry against the actor's own workspace", async () => {
    await admin.fetch("/admin/users/u_bob/role", {
      method: "PUT",
      body: JSON.stringify({ roleId: "role_member" }),
    });

    // The workspace used to come from configuration, which is right only while
    // there is exactly one workspace. It now comes from the actor's row.
    const { rows } = await db().query<{ mismatched: string }>(
      `SELECT count(*)::text AS mismatched
       FROM audit_log a JOIN users u ON u.id = a.actor_id
       WHERE a.workspace_id <> u.workspace_id`,
    );
    expect(rows[0].mismatched).toBe("0");
  });

  it("counts an audit write and agrees with the row it wrote", async () => {
    const before = countOf(await read(), "audit.written");

    const response = await admin.fetch("/admin/users/u_bob/role", {
      method: "PUT",
      body: JSON.stringify({ roleId: "role_member" }),
    });
    expect(response.status).toBe(204);

    const after = await read();
    expect(countOf(after, "audit.written")).toBeGreaterThan(before);
    expect(countOf(after, "audit.failed")).toBe(0);

    const { rows } = await db().query<{ created_at: Date }>(
      `SELECT created_at FROM audit_log ORDER BY created_at DESC LIMIT 1`,
    );
    // The endpoint's lastAuditAt survives a restart, unlike the counters, so it
    // must track the table rather than the in-process tally.
    expect(after.lastAuditAt).toBe(rows[0].created_at.toISOString());
  });
});
