import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNTS,
  asClient,
  assertServerRunning,
  BASE_URL,
  closeDb,
  db,
  DEMO_PASSWORD,
  sessionCookieOf,
  signIn,
  type Client,
} from "./helpers";

/**
 * Creating, entering and switching workspaces — and, above all, that a second
 * workspace is sealed off from the first.
 *
 * The owner of a brand-new workspace is an administrator there, and every
 * attack below is one an administrator of workspace B could try against
 * Northwind (A) with ids they can guess or read from their own screens.
 */
describe("multiple workspaces", () => {
  let owner: Client; // Harman, in Northwind
  let member: Client; // Bob, in Northwind
  let other: Client; // Harman's new account, owner of the test workspace
  let otherId = "";
  let otherSlug = "";
  let otherGeneral = "";

  const login = (body: Record<string, unknown>) =>
    fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ACCOUNTS.owner, password: DEMO_PASSWORD, ...body }),
    });

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
  });

  afterAll(async () => {
    // Everything the test workspace holds cascades from its row.
    if (otherId) await db().query(`DELETE FROM workspaces WHERE id = $1`, [otherId]);
    await closeDb();
  });

  describe("creating", () => {
    it("is refused to a member", async () => {
      const response = await member.fetch("/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: "Bob's Co", password: DEMO_PASSWORD }),
      });
      expect(response.status).toBe(403);
    });

    it("asks for the creator's password", async () => {
      const response = await owner.fetch("/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: "Wrong Password Co", password: "not-it" }),
      });
      expect(response.status).toBe(403);
      const made = await db().query(`SELECT 1 FROM workspaces WHERE name = 'Wrong Password Co'`);
      expect(made.rowCount).toBe(0);
    });

    it("creates the workspace and moves the creator into it", async () => {
      const creator = await signIn(ACCOUNTS.owner);
      const response = await creator.fetch("/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: "Isolation Test Co", password: DEMO_PASSWORD }),
      });
      expect(response.status).toBe(201);
      const body = (await response.json()) as { workspaceId: string; slug: string };
      otherId = body.workspaceId;
      otherSlug = body.slug;
      expect(otherSlug).toMatch(/^isolation-test-co/);

      const me = await asClient(sessionCookieOf(response), "").fetch("/auth/me");
      const user = (await me.json()) as { id: string; email: string };
      other = asClient(sessionCookieOf(response), user.id);
      expect(user.email).toBe(ACCOUNTS.owner);
      expect(user.id).not.toBe("u_harman");

      // The session it was created from ended.
      expect((await creator.fetch("/auth/me")).status).toBe(401);

      const general = await db().query<{ id: string }>(
        `SELECT id FROM channels WHERE workspace_id = $1 AND name = 'general'`,
        [otherId],
      );
      otherGeneral = general.rows[0].id;
    });

    it("gives it its own four built-in roles, with the creator as owner", async () => {
      const roles = (await (await other.fetch("/admin/roles")).json()) as { id: string; kind: string | null }[];
      expect(roles.map((role) => role.kind).sort()).toEqual(["admin", "guest", "member", "owner"]);
      expect(roles.every((role) => !["role_owner", "role_member", "role_admin", "role_guest"].includes(role.id))).toBe(true);

      const permissions = (await (await other.fetch("/me/permissions")).json()) as string[];
      expect(permissions).toContain("p_workspace_create");
      expect(permissions).toContain("p_admin_settings");
    });

    it("starts with complete settings and nothing from Northwind", async () => {
      const settings = await (await other.fetch("/admin/settings")).json();
      expect(settings.workspaceName).toBe("Isolation Test Co");
      expect(settings.signupDomains).toEqual([]);
      expect(settings.allowGuestAccounts).toBe(false);

      const users = (await (await other.fetch("/users")).json()) as { id: string }[] | { items: { id: string }[] };
      const list = Array.isArray(users) ? users : users.items;
      expect(list.map((user) => user.id)).toEqual([other.userId]);
    });
  });

  describe("signing in and switching", () => {
    it("asks which workspace when the password matches several accounts", async () => {
      const response = await login({});
      expect(response.status).toBe(409);
      const body = (await response.json()) as { code: string; workspaces: { slug: string }[] };
      expect(body.code).toBe("choose_workspace");
      expect(body.workspaces.map((workspace) => workspace.slug).sort()).toEqual(
        ["northwind", otherSlug].sort(),
      );
    });

    it("signs in to the one named", async () => {
      const response = await login({ workspace: otherSlug });
      expect(response.status).toBe(200);
      expect(((await response.json()) as { user: { id: string } }).user.id).toBe(other.userId);
    });

    it("shows no choice to a wrong password", async () => {
      const response = await login({ password: "wrong-password" });
      expect(response.status).toBe(401);
    });

    it("lists both in the switcher, marking the current one", async () => {
      const list = (await (await owner.fetch("/workspaces")).json()) as { id: string; isCurrent: boolean }[];
      expect(list.find((workspace) => workspace.isCurrent)?.id).toBe("ws_northwind");
      expect(list.some((workspace) => workspace.id === otherId && !workspace.isCurrent)).toBe(true);
    });

    it("never lists a workspace to someone without an account there", async () => {
      const list = (await (await member.fetch("/workspaces")).json()) as { id: string }[];
      expect(list.map((workspace) => workspace.id)).toEqual(["ws_northwind"]);
    });

    it("switches only with the other account's password, ending this session", async () => {
      const client = await signIn(ACCOUNTS.owner);
      const wrong = await client.fetch("/auth/switch", {
        method: "POST",
        body: JSON.stringify({ workspaceId: otherId, password: "not-it" }),
      });
      expect(wrong.status).toBe(403);

      const right = await client.fetch("/auth/switch", {
        method: "POST",
        body: JSON.stringify({ workspaceId: otherId, password: DEMO_PASSWORD }),
      });
      expect(right.status).toBe(200);
      expect((await client.fetch("/auth/me")).status).toBe(401);
      const me = await asClient(sessionCookieOf(right), "").fetch("/auth/me");
      expect(((await me.json()) as { id: string }).id).toBe(other.userId);
    });

    it("cannot switch into a workspace without an account there", async () => {
      const response = await member.fetch("/auth/switch", {
        method: "POST",
        body: JSON.stringify({ workspaceId: otherId, password: DEMO_PASSWORD }),
      });
      expect(response.status).toBe(404);
    });
  });

  describe("an administrator of the new workspace cannot reach Northwind", () => {
    it("cannot mint a token for a Northwind person or bot", async () => {
      for (const target of ["u_bob", "u_deploybot"]) {
        const response = await other.fetch(`/admin/integrations/bots/${target}/tokens`, {
          method: "POST",
          body: JSON.stringify({ name: "stolen" }),
        });
        expect(response.status).toBe(404);
        expect((await other.fetch(`/admin/integrations/bots/${target}/tokens`)).status).toBe(404);
      }
      const minted = await db().query(`SELECT 1 FROM integration_tokens WHERE name = 'stolen'`);
      expect(minted.rowCount).toBe(0);
    });

    it("cannot change a Northwind person's role", async () => {
      const roles = (await (await other.fetch("/admin/roles")).json()) as { id: string; kind: string }[];
      const guest = roles.find((role) => role.kind === "guest")!.id;
      const response = await other.fetch("/admin/users/u_bob/role", {
        method: "PUT",
        body: JSON.stringify({ roleId: guest }),
      });
      expect(response.status).toBe(404);
      const bob = await db().query<{ role_id: string }>(`SELECT role_id FROM users WHERE id = 'u_bob'`);
      expect(bob.rows[0].role_id).not.toBe(guest);
    });

    it("cannot deactivate a Northwind person", async () => {
      const response = await other.fetch("/admin/users/u_bob/status", {
        method: "PUT",
        body: JSON.stringify({ status: "deactivated" }),
      });
      expect(response.status).toBe(404);
      expect((await member.fetch("/auth/me")).status).toBe(200);
    });

    it("cannot edit Northwind's role permissions", async () => {
      const response = await other.fetch("/admin/roles/role_member/permissions/p_admin_settings", {
        method: "PUT",
      });
      expect(response.status).toBe(404);
      const batch = await other.fetch("/admin/permissions", {
        method: "PUT",
        body: JSON.stringify({ changes: [{ roleId: "role_member", permissionId: "p_admin_settings", granted: true }] }),
      });
      expect(batch.status).toBe(422);
      const granted = await db().query(
        `SELECT 1 FROM role_permissions WHERE role_id = 'role_member' AND permission_id = 'p_admin_settings'`,
      );
      expect(granted.rowCount).toBe(0);
    });

    it("gains nothing from a role id pointing at Northwind", async () => {
      // Even if a row somehow pointed a B account at A's owner role, the
      // permission check follows only roles of the account's own workspace.
      await db().query(`UPDATE users SET role_id = 'role_owner' WHERE id = $1`, [other.userId]);
      try {
        expect((await other.fetch("/admin/settings")).status).toBe(403);
      } finally {
        await db().query(
          `UPDATE users SET role_id = (SELECT id FROM roles WHERE workspace_id = $2 AND kind = 'owner') WHERE id = $1`,
          [other.userId, otherId],
        );
      }
      expect((await other.fetch("/admin/settings")).status).toBe(200);
    });

    it("cannot add a Northwind person to its channel", async () => {
      const response = await other.fetch(`/channels/${otherGeneral}/members`, {
        method: "POST",
        body: JSON.stringify({ userIds: ["u_bob"] }),
      });
      expect([200, 201]).toContain(response.status);
      const added = await db().query(
        `SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = 'u_bob'`,
        [otherGeneral],
      );
      expect(added.rowCount).toBe(0);
    });

    it("cannot take a Northwind attachment into its channel", async () => {
      const attachment = await db().query<{ id: string; message_id: string | null; channel_id: string | null }>(
        `SELECT a.id, a.message_id, a.channel_id FROM attachments a
           JOIN users u ON u.id = a.uploaded_by WHERE u.workspace_id = 'ws_northwind' LIMIT 1`,
      );
      if (!attachment.rowCount) return; // nothing seeded to steal
      const before = attachment.rows[0];
      await other.fetch(`/channels/${otherGeneral}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: "mine now", attachmentIds: [before.id] }),
      });
      const after = await db().query<{ message_id: string | null; channel_id: string | null }>(
        `SELECT message_id, channel_id FROM attachments WHERE id = $1`,
        [before.id],
      );
      expect(after.rows[0]).toEqual({ message_id: before.message_id, channel_id: before.channel_id });
    });

    it("does not notify a Northwind person with the same username", async () => {
      const response = await other.fetch(`/channels/${otherGeneral}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: "hello @bob and @harman.singh" }),
      });
      expect(response.status).toBe(201);
      const { id } = (await response.json()) as { id: string };
      const mentioned = await db().query<{ user_id: string }>(
        `SELECT user_id FROM message_mentions WHERE message_id = $1`,
        [id],
      );
      // Harman's own account in this workspace is mentioned; Northwind's Bob and Harman are not.
      expect(mentioned.rows.map((row) => row.user_id)).not.toContain("u_bob");
      expect(mentioned.rows.map((row) => row.user_id)).not.toContain("u_harman");
    });

    it("cannot reply into a Northwind thread", async () => {
      const response = await other.fetch(`/channels/${otherGeneral}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: "sneaky reply", threadRootId: "m_gen_6" }),
      });
      expect(response.status).toBe(422);
    });

    it("cannot read or act on Northwind messages by id", async () => {
      const probes: [string, RequestInit?][] = [
        ["/messages/m_gen_6"],
        ["/messages/m_gen_6/replies"],
        ["/messages/m_gen_6/reactions", { method: "POST", body: JSON.stringify({ emoji: "👀" }) }],
        ["/messages/m_gen_6/reactions/%F0%9F%91%80", { method: "DELETE" }],
        ["/messages/m_gen_6/save", { method: "PUT", body: JSON.stringify({ isSaved: true }) }],
        ["/threads/m_gen_6"],
        ["/threads/m_gen_6/follow", { method: "PUT", body: JSON.stringify({ isFollowing: true }) }],
        ["/threads/m_gen_6/read", { method: "POST" }],
      ];
      for (const [path, init] of probes) {
        const response = await other.fetch(path, init);
        expect(response.status, path).toBe(404);
      }
      const touched = await db().query(
        `SELECT 1 FROM reactions WHERE message_id = 'm_gen_6' AND user_id = $1
         UNION ALL SELECT 1 FROM message_saves WHERE message_id = 'm_gen_6' AND user_id = $1
         UNION ALL SELECT 1 FROM thread_follows WHERE root_id = 'm_gen_6' AND user_id = $1`,
        [other.userId],
      );
      expect(touched.rowCount).toBe(0);
    });

    it("cannot read Northwind people, channels or logo", async () => {
      expect((await other.fetch("/users/u_bob")).status).toBe(404);
      expect((await other.fetch("/workspaces/ws_northwind/channels")).status).toBe(404);
      expect((await other.fetch("/workspaces/ws_northwind/dms")).status).toBe(404);
      expect((await other.fetch("/workspaces/ws_northwind/logo")).status).toBe(404);
      expect((await other.fetch("/channels/ch_general/messages")).status).toBe(403);
    });

    it("cannot point integrations at Northwind channels or bots", async () => {
      const incoming = await other.fetch("/admin/integrations/incoming-webhooks", {
        method: "POST",
        body: JSON.stringify({ name: "x", channelId: otherGeneral, botUserId: "u_deploybot" }),
      });
      expect([404, 422]).toContain(incoming.status);
      const outgoing = await other.fetch("/admin/integrations/outgoing-webhooks", {
        method: "POST",
        body: JSON.stringify({ name: "x", channelId: "ch_general", targetUrl: "https://example.com/hook", triggerWords: [] }),
      });
      expect(outgoing.status).toBe(404);
    });

    it("sees only its own activity", async () => {
      const days = (await (await other.fetch("/admin/activity?days=7")).json()) as { messages: number }[];
      const total = days.reduce((sum, day) => sum + day.messages, 0);
      // Only the few messages this test posted, not Northwind's.
      expect(total).toBeLessThan(5);
    });
  });

  describe("and Northwind cannot reach the new workspace", () => {
    it("cannot read its people or channels", async () => {
      expect((await member.fetch(`/users/${other.userId}`)).status).toBe(404);
      expect((await member.fetch(`/workspaces/${otherId}/channels`)).status).toBe(404);
      expect((await owner.fetch(`/channels/${otherGeneral}/messages`)).status).toBe(403);
    });
  });

  describe("inside the new workspace", () => {
    it("invites join its Member role and #general", async () => {
      const link = (await (await other.fetch("/invites", { method: "POST", body: JSON.stringify({}) })).json()) as {
        url: string;
      };
      const token = link.url.split("/join/")[1];
      const email = `mw-invitee-${Date.now()}@example.com`;
      const joined = await fetch(`${BASE_URL}/api/v1/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Multi Invitee", email, password: "a-long-enough-password" }),
      });
      expect(joined.status).toBe(201);
      const row = await db().query<{ workspace_id: string; kind: string; in_general: boolean }>(
        `SELECT u.workspace_id, r.kind,
                EXISTS (SELECT 1 FROM channel_members cm WHERE cm.user_id = u.id AND cm.channel_id = $2) AS in_general
           FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = $1`,
        [email, otherGeneral],
      );
      expect(row.rows[0]).toEqual({ workspace_id: otherId, kind: "member", in_general: true });
    });

    it("deleting a custom role moves its people to this workspace's Member", async () => {
      const created = await other.fetch("/admin/roles", {
        method: "POST",
        body: JSON.stringify({ name: "Temp", description: "" }),
      });
      expect(created.status).toBe(201);
      const { id: roleId } = (await created.json()) as { id: string };
      const deleted = await other.fetch(`/admin/roles/${roleId}`, { method: "DELETE" });
      expect(deleted.status).toBe(200);
      const { movedTo } = (await deleted.json()) as { movedTo: string };
      const target = await db().query<{ workspace_id: string; kind: string }>(
        `SELECT workspace_id, kind FROM roles WHERE id = $1`,
        [movedTo],
      );
      expect(target.rows[0]).toEqual({ workspace_id: otherId, kind: "member" });
    });

    it("keeps the owner role locked", async () => {
      const roles = (await (await other.fetch("/admin/roles")).json()) as { id: string; kind: string }[];
      const ownerRole = roles.find((role) => role.kind === "owner")!.id;
      const response = await other.fetch(`/admin/roles/${ownerRole}/permissions/p_admin_settings`, {
        method: "DELETE",
      });
      expect(response.status).toBe(403);
    });
  });
});
