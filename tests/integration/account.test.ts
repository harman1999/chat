import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertServerRunning,
  BASE_URL,
  closeDb,
  db,
  DEMO_PASSWORD,
  signIn,
  type Client,
} from "./helpers";

/**
 * A spare account, so changing its password cannot disturb the sign-ins the
 * other suites depend on.
 */
const ACCOUNT = "ingrid.khan@northwind.io";
const NEW_PASSWORD = "a-different-password-9!";

describe("account security", () => {
  let session: Client;

  beforeAll(async () => {
    await assertServerRunning();
    session = await signIn(ACCOUNT);
  });

  afterAll(closeDb);

  describe("password change", () => {
    it("rejects a wrong current password without changing anything", async () => {
      const response = await session.fetch("/users/me/password", {
        method: "PUT",
        body: JSON.stringify({
          currentPassword: "not-the-current-password",
          newPassword: NEW_PASSWORD,
        }),
      });
      expect(response.status).toBe(403);

      // The old password must still work.
      await expect(signIn(ACCOUNT, DEMO_PASSWORD)).resolves.toBeTruthy();
    });

    it("revokes other sessions everywhere, not just in Postgres", async () => {
      // Two devices signed in as the same person.
      const keeper = await signIn(ACCOUNT);
      const other = await signIn(ACCOUNT);
      expect((await other.fetch("/auth/me")).status).toBe(200);

      expect(
        (
          await keeper.fetch("/users/me/password", {
            method: "PUT",
            body: JSON.stringify({
              currentPassword: DEMO_PASSWORD,
              newPassword: NEW_PASSWORD,
            }),
          })
        ).status,
      ).toBe(204);

      // The session that made the change survives.
      expect((await keeper.fetch("/auth/me")).status).toBe(200);

      // The other one must be dead. Sessions are gated by the Redis cache, so
      // deleting only the Postgres row would leave this request succeeding
      // until the TTL expired.
      expect((await other.fetch("/auth/me")).status).toBe(401);

      const { rows } = await db().query<{ count: string }>(
        `SELECT count(*)::text FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
        [ACCOUNT],
      );
      expect(rows[0].count).toBe("1");

      // Restore, so a re-run starts from the same place.
      await keeper.fetch("/users/me/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword: NEW_PASSWORD, newPassword: DEMO_PASSWORD }),
      });
    });

    it("records the change in the audit log", async () => {
      const { rows } = await db().query<{ action: string; severity: string }>(
        `SELECT a.action, a.severity FROM audit_log a
         JOIN users u ON u.id = a.actor_id
         WHERE u.email = $1 AND a.action = 'auth.password_changed'
         ORDER BY a.created_at DESC LIMIT 1`,
        [ACCOUNT],
      );
      expect(rows[0]?.action).toBe("auth.password_changed");
      expect(rows[0]?.severity).toBe("warning");
    });
  });

  describe("sessions", () => {
    it("marks which session is the current one", async () => {
      // A fresh sign-in, because the password change above deliberately
      // revoked every session but the one that made it.
      const fresh = await signIn(ACCOUNT);
      const list = (await fresh
        .fetch("/users/me/sessions")
        .then((r) => r.json())) as { id: string; isCurrent: boolean }[];

      expect(list.filter((entry) => entry.isCurrent)).toHaveLength(1);
    });

    it("signs out every other device but keeps this one", async () => {
      const keeper = await signIn(ACCOUNT);
      const other = await signIn(ACCOUNT);

      expect((await keeper.fetch("/users/me/sessions", { method: "DELETE" })).status).toBe(204);
      expect((await keeper.fetch("/auth/me")).status).toBe(200);
      expect((await other.fetch("/auth/me")).status).toBe(401);
    });
  });

  describe("sign out", () => {
    it("invalidates the cookie it was called with", async () => {
      const doomed = await signIn(ACCOUNT);
      expect((await doomed.fetch("/auth/logout", { method: "POST" })).status).toBe(204);
      expect((await doomed.fetch("/auth/me")).status).toBe(401);
    });

    it("clears the cookie on the client too", async () => {
      const doomed = await signIn(ACCOUNT);
      const response = await fetch(`${BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { cookie: doomed.cookie },
      });
      // Without an expiry in the past the browser keeps sending a dead cookie.
      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);
    });
  });
});
