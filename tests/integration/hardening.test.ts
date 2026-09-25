import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNTS,
  assertServerRunning,
  anonFetch,
  closeDb,
  db,
  signIn,
  type Client,
} from "./helpers";

/**
 * The changes with silent-failure risk: a bad allow-list drops valid keys
 * without complaining, and a broken limiter simply never fires.
 */
describe("hardening", () => {
  let owner: Client;

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
  });

  afterAll(closeDb);

  describe("body validation", () => {
    it("rejects a malformed JSON body with 400 rather than treating it as empty", async () => {
      const response = await owner.fetch("/users/me/presence", {
        method: "PUT",
        body: "{not json",
      });
      expect(response.status).toBe(400);
    });

    it("reports which field failed", async () => {
      const response = await owner.fetch("/users/me/presence", {
        method: "PUT",
        body: JSON.stringify({ status: 42 }),
      });
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { issues?: { path: string }[] };
      expect(payload.issues?.[0]?.path).toBe("status");
    });
  });

  describe("preferences allow-list", () => {
    it("keeps known keys and strips unknown ones", async () => {
      const response = await owner.fetch("/users/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({ density: "compact", evilKey: "x".repeat(500) }),
      });
      expect(response.status).toBe(204);

      const row = await db().query<{ preferences: Record<string, unknown> }>(
        `SELECT preferences FROM user_preferences WHERE user_id = $1`,
        [owner.userId],
      );
      // The valid key must survive — a too-strict allow-list is the silent
      // failure mode this test exists to catch.
      expect(row.rows[0].preferences.density).toBe("compact");
      expect(row.rows[0].preferences).not.toHaveProperty("evilKey");

      await owner.fetch("/users/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({ density: "comfortable" }),
      });
    });

    it("rejects a value outside the enum", async () => {
      const response = await owner.fetch("/users/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({ density: "enormous" }),
      });
      expect(response.status).toBe(400);
    });
  });

  describe("workspace settings allow-list", () => {
    it("keeps known keys and strips unknown ones", async () => {
      const response = await owner.fetch("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ maxUploadMb: 42, injected: { deeply: "nested" } }),
      });
      expect(response.status).toBe(204);

      const row = await db().query<{ settings: Record<string, unknown> }>(
        `SELECT settings FROM workspaces WHERE id = 'ws_northwind'`,
      );
      expect(row.rows[0].settings.maxUploadMb).toBe(42);
      expect(row.rows[0].settings).not.toHaveProperty("injected");

      await owner.fetch("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ maxUploadMb: 50 }),
      });
    });
  });

  describe("rate limiting", () => {
    it("limits repeated failed sign-ins per account", async () => {
      // A dedicated address, so throttling it cannot lock out the accounts the
      // other suites sign in with.
      const attempt = () =>
        anonFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: "marco.ferrari@northwind.io", password: "wrong-password" }),
        });

      let limited = false;
      for (let i = 0; i < 15; i++) {
        const response = await attempt();
        if (response.status === 429) {
          expect(response.headers.get("retry-after")).toBeTruthy();
          limited = true;
          break;
        }
        expect(response.status).toBe(401);
      }

      expect(limited).toBe(true);
    });

    it("does not throttle a different account from the same address", async () => {
      // The per-IP bucket is deliberately loose: colleagues behind one NAT must
      // not lock each other out.
      const response = await anonFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: ACCOUNTS.admin, password: "helix-demo-password" }),
      });
      expect(response.status).toBe(200);
    });
  });

  describe("audit trail", () => {
    it("records an admin role change", async () => {
      const before = await db().query<{ n: string }>(
        `SELECT count(*)::text AS n FROM audit_log WHERE action = 'user.role_changed'`,
      );

      const response = await owner.fetch("/admin/users/u_bob/role", {
        method: "PUT",
        body: JSON.stringify({ roleId: "role_moderator" }),
      });
      expect(response.status).toBe(204);

      const after = await db().query<{ n: string; target: string }>(
        `SELECT count(*)::text AS n,
                (SELECT target FROM audit_log WHERE action = 'user.role_changed'
                  ORDER BY created_at DESC LIMIT 1) AS target
         FROM audit_log WHERE action = 'user.role_changed'`,
      );
      expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n) + 1);
      expect(after.rows[0].target).toContain("role_moderator");

      await db().query(`UPDATE users SET role_id = 'role_member' WHERE id = 'u_bob'`);
    });
  });
});

describe("uploads", () => {
  let owner: Client;

  beforeAll(async () => {
    owner = await signIn(ACCOUNTS.owner);
  });

  it("rejects bytes larger than the reserved size", async () => {
    const ticket = await owner
      .fetch("/files/upload-ticket", {
        method: "POST",
        body: JSON.stringify({ fileName: "small.bin", sizeBytes: 16, mimeType: "application/octet-stream" }),
      })
      .then((response) => response.json() as Promise<{ attachmentId: string }>);

    // The ticket declared 16 bytes; send far more.
    const response = await owner.fetch(`/files/${ticket.attachmentId}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.alloc(4096),
    });

    expect(response.status).toBe(413);

    await db().query(`DELETE FROM attachments WHERE id = $1`, [ticket.attachmentId]);
  });

  it("records the bytes that actually landed", async () => {
    const payload = Buffer.alloc(1024, 7);
    const ticket = await owner
      .fetch("/files/upload-ticket", {
        method: "POST",
        body: JSON.stringify({ fileName: "exact.bin", sizeBytes: 4096, mimeType: "application/octet-stream" }),
      })
      .then((response) => response.json() as Promise<{ attachmentId: string }>);

    const response = await owner.fetch(`/files/${ticket.attachmentId}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: payload,
    });
    expect(response.status).toBe(204);

    const row = await db().query<{ size_bytes: string }>(
      `SELECT size_bytes FROM attachments WHERE id = $1`,
      [ticket.attachmentId],
    );
    // Reconciled down from the 4096 the client declared.
    expect(Number(row.rows[0].size_bytes)).toBe(payload.byteLength);

    await db().query(`DELETE FROM attachments WHERE id = $1`, [ticket.attachmentId]);
  });

  it("rejects an oversized declared size at ticket time", async () => {
    const response = await owner.fetch("/files/upload-ticket", {
      method: "POST",
      body: JSON.stringify({ fileName: "huge.bin", sizeBytes: 60 * 1024 * 1024 }),
    });
    expect(response.status).toBe(400);
  });
});
