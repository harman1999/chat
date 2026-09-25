import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

/**
 * Guards that must hold regardless of what the UI offers. Each of these
 * corresponds to a gap found in the Phase 8 audit.
 */
describe("authorization", () => {
  let owner: Client;
  let member: Client;

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
  });

  afterAll(closeDb);

  describe("message pinning", () => {
    it("rejects pinning a message in a channel the caller is not a member of", async () => {
      // Bob is not a member of #frontend.
      const isMember = await db().query(
        `SELECT 1 FROM channel_members WHERE channel_id = 'ch_frontend' AND user_id = $1`,
        [member.userId],
      );
      expect(isMember.rowCount).toBe(0);

      const target = await db().query<{ id: string }>(
        `SELECT id FROM messages WHERE channel_id = 'ch_frontend' AND thread_root_id IS NULL LIMIT 1`,
      );
      const messageId = target.rows[0].id;

      const response = await member.fetch(`/messages/${messageId}/pin`, {
        method: "PUT",
        body: JSON.stringify({ isPinned: true }),
      });

      expect(response.status).toBe(403);

      const after = await db().query<{ is_pinned: boolean }>(
        `SELECT is_pinned FROM messages WHERE id = $1`,
        [messageId],
      );
      expect(after.rows[0].is_pinned).toBe(false);
    });

    it("allows a member to pin within their own channel", async () => {
      const target = await db().query<{ id: string }>(
        `SELECT m.id FROM messages m
         JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $1
         WHERE m.thread_root_id IS NULL AND NOT m.is_pinned LIMIT 1`,
        [member.userId],
      );
      const messageId = target.rows[0].id;

      const response = await member.fetch(`/messages/${messageId}/pin`, {
        method: "PUT",
        body: JSON.stringify({ isPinned: true }),
      });
      expect(response.status).toBe(204);

      await db().query(`UPDATE messages SET is_pinned = false WHERE id = $1`, [messageId]);
    });
  });

  describe("presence", () => {
    it("rejects a presence value outside the allowed set", async () => {
      const response = await owner.fetch("/users/me/presence", {
        method: "PUT",
        body: JSON.stringify({ status: "definitely-not-a-status" }),
      });

      expect(response.status).toBe(400);

      const row = await db().query<{ presence: string }>(
        `SELECT presence FROM users WHERE id = $1`,
        [owner.userId],
      );
      expect(["online", "away", "dnd", "offline"]).toContain(row.rows[0].presence);
    });
  });

  describe("admin role assignment", () => {
    it("rejects a role that does not exist", async () => {
      const response = await owner.fetch(`/admin/users/u_bob/role`, {
        method: "PUT",
        body: JSON.stringify({ roleId: "role_does_not_exist" }),
      });

      // Must be a 4xx, not an opaque 500 from an FK violation.
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });
});
