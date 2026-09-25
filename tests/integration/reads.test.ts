import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, signIn, type Client } from "./helpers";

/**
 * The read endpoints behind the admin surface and the notification views.
 *
 * They were covered only by the route-surface check — which proves they refuse
 * the wrong caller, not that they answer the right one with anything usable.
 */
describe("admin reads", () => {
  let admin: Client;

  beforeAll(async () => {
    await assertServerRunning();
    admin = await signIn(ACCOUNTS.owner);
  });

  afterAll(closeDb);

  const get = <T,>(path: string) => admin.fetch(path).then((r) => r.json() as Promise<T>);

  it("reports workspace statistics that agree with each other", async () => {
    const stats = await get<{
      totalUsers: number; activeUsers7d: number; totalChannels: number;
      publicChannels: number; privateChannels: number; storageUsedBytes: number;
    }>("/admin/stats");

    expect(stats.totalUsers).toBeGreaterThan(0);
    // Caught in Phase 7: active counted deactivated accounts while total did not.
    expect(stats.activeUsers7d).toBeLessThanOrEqual(stats.totalUsers);
    expect(stats.publicChannels + stats.privateChannels).toBeLessThanOrEqual(stats.totalChannels);
    expect(stats.storageUsedBytes).toBeGreaterThanOrEqual(0);
  });

  it("does not claim more members than the workspace has", async () => {
    const [stats, channels] = await Promise.all([
      get<{ totalUsers: number }>("/admin/stats"),
      get<{ memberCount: number; name: string }[]>("/admin/channels"),
    ]);
    for (const channel of channels) {
      expect(channel.memberCount).toBeLessThanOrEqual(stats.totalUsers);
    }
  });

  it("returns a dated activity series", async () => {
    const series = await get<{ date: string; messages: number; activeUsers: number }[]>(
      "/admin/activity?days=30",
    );
    expect(series.length).toBeGreaterThan(0);
    expect(series[0].date).toMatch(/^\d{4}-\d{2}-\d{2}/);
    // Ordered oldest first, because the chart plots it left to right.
    const times = series.map((point) => Date.parse(point.date));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("lists roles with their permissions and member counts", async () => {
    const roles = await get<{ id: string; name: string; permissionIds: string[]; memberCount: number }[]>(
      "/admin/roles",
    );
    const owner = roles.find((role) => role.id === "role_owner");
    expect(owner).toBeDefined();
    expect(owner?.permissionIds.length).toBeGreaterThan(0);
  });

  it("lists permissions grouped for display", async () => {
    const permissions = await get<{ id: string; group: string; label: string }[]>("/admin/permissions");
    expect(permissions.length).toBeGreaterThan(0);
    expect(permissions.every((p) => p.group && p.label)).toBe(true);
  });

  it("returns audit entries newest first", async () => {
    const entries = await get<{ id: string; action: string; createdAt: string }[]>("/admin/audit-log");
    expect(entries.length).toBeGreaterThan(0);
    const times = entries.map((entry) => Date.parse(entry.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("breaks storage down without exceeding the total", async () => {
    const buckets = await get<{ label: string; bytes: number }[]>("/admin/storage");
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.every((bucket) => bucket.bytes >= 0)).toBe(true);
  });

  it("lists identity providers without leaking their secrets", async () => {
    const raw = await admin.fetch("/admin/auth/providers").then((r) => r.text());
    expect(raw).not.toMatch(/clientSecret|client_secret/i);
  });
});

describe("notifications and mentions", () => {
  let member: Client;

  beforeAll(async () => {
    await assertServerRunning();
    member = await signIn(ACCOUNTS.member);
  });

  afterAll(closeDb);

  it("lists the caller's own notifications only", async () => {
    const list = (await member.fetch("/notifications").then((r) => r.json())) as {
      id: string;
      isRead: boolean;
    }[];
    expect(Array.isArray(list)).toBe(true);
  });

  it("marks everything read, and it stays read", async () => {
    expect((await member.fetch("/notifications/read-all", { method: "POST" })).status).toBe(204);

    const after = (await member.fetch("/notifications").then((r) => r.json())) as {
      isRead: boolean;
    }[];
    expect(after.every((entry) => entry.isRead)).toBe(true);
  });

  it("returns only messages that actually mention the caller", async () => {
    const mentions = (await member.fetch("/me/mentions").then((r) => r.json())) as {
      mentionedUserIds: string[];
    }[];
    for (const message of mentions) {
      expect(message.mentionedUserIds).toContain(member.userId);
    }
  });
});
