import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, db, signIn, type Client } from "./helpers";

/** 1×1 transparent PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

describe("workspace name and logo", () => {
  let owner: Client;
  let member: Client;
  let original: { name: string; initials: string };

  beforeAll(async () => {
    await assertServerRunning();
    owner = await signIn(ACCOUNTS.owner);
    member = await signIn(ACCOUNTS.member);
    const row = await db().query<{ name: string; initials: string }>(
      `SELECT name, initials FROM workspaces WHERE id = 'ws_northwind'`,
    );
    original = row.rows[0];
  });

  afterAll(async () => {
    // Shares the database with the running app: put everything back.
    await db().query(`UPDATE workspaces SET name = $1, initials = $2 WHERE id = 'ws_northwind'`, [
      original.name,
      original.initials,
    ]);
    await owner.fetch("/admin/workspace/logo", { method: "DELETE" });
    // Audit rows are left, as every suite leaves them: the log is append-only.
    await closeDb();
  });

  const workspaces = async (client: Client) =>
    (await (await client.fetch("/workspaces")).json()) as {
      id: string; name: string; initials: string; logoUrl: string | null;
    }[];

  const putLogo = (client: Client, body: Buffer, type = "image/png") =>
    client.fetch("/admin/workspace/logo", {
      method: "PUT",
      body: new Uint8Array(body),
      headers: { "Content-Type": type },
    });

  describe("rename", () => {
    it("changes the name everyone sees, and its initials", async () => {
      const response = await owner.fetch("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ workspaceName: "Renamed Test Co" }),
      });
      expect(response.status).toBe(204);

      // Seen by a member through the switcher's own endpoint, not only by admins.
      const [workspace] = await workspaces(member);
      expect(workspace.name).toBe("Renamed Test Co");
      expect(workspace.initials).toBe("RC");

      const settings = await (await owner.fetch("/admin/settings")).json();
      expect(settings.workspaceName).toBe("Renamed Test Co");
    });

    it("is not stored as a second copy in settings", async () => {
      const row = await db().query<{ settings: Record<string, unknown> }>(
        `SELECT settings FROM workspaces WHERE id = 'ws_northwind'`,
      );
      expect(row.rows[0].settings).not.toHaveProperty("workspaceName");
    });

    it("records the old and new name in the audit log", async () => {
      const row = await db().query<{ target: string }>(
        `SELECT target FROM audit_log WHERE action = 'workspace.renamed' ORDER BY created_at DESC LIMIT 1`,
      );
      expect(row.rows[0].target).toBe(`${original.name} → Renamed Test Co`);
    });

    it("refuses a blank name", async () => {
      const response = await owner.fetch("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ workspaceName: "   " }),
      });
      expect(response.status).toBe(400);
      expect((await workspaces(owner))[0].name).toBe("Renamed Test Co");
    });

    it("refuses a member", async () => {
      const response = await member.fetch("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ workspaceName: "Taken over" }),
      });
      expect(response.status).toBe(403);
    });
  });

  describe("logo", () => {
    it("has none until one is uploaded", async () => {
      await owner.fetch("/admin/workspace/logo", { method: "DELETE" });
      expect((await workspaces(owner))[0].logoUrl).toBeNull();
    });

    it("uploads a PNG and serves it to members with its sniffed type", async () => {
      const response = await putLogo(owner, PNG);
      expect(response.status).toBe(200);
      const { logoUrl } = await response.json();

      const [workspace] = await workspaces(member);
      expect(workspace.logoUrl).toBe(logoUrl);

      const image = await member.fetch(logoUrl.replace("/api/v1", ""));
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toBe("image/png");
      expect(image.headers.get("x-content-type-options")).toBe("nosniff");
      expect(Buffer.from(await image.arrayBuffer()).equals(PNG)).toBe(true);
    });

    it("gives a new URL when the logo changes, so caches refetch", async () => {
      const before = (await workspaces(owner))[0].logoUrl;
      await new Promise((resolve) => setTimeout(resolve, 5));
      await putLogo(owner, PNG);
      expect((await workspaces(owner))[0].logoUrl).not.toBe(before);
    });

    it("judges the file by its bytes, not its declared type", async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      expect((await putLogo(owner, svg, "image/svg+xml")).status).toBe(415);
      // Lying about the type does not help.
      expect((await putLogo(owner, Buffer.from("<html><script>alert(1)</script>"), "image/png")).status).toBe(415);
    });

    it("refuses an image over 1 MB", async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
      expect((await putLogo(owner, big)).status).toBe(413);
    });

    it("refuses an empty upload", async () => {
      expect((await putLogo(owner, Buffer.alloc(0))).status).toBe(400);
    });

    it("does not serve another workspace's logo", async () => {
      expect((await member.fetch("/workspaces/ws_atlas/logo")).status).toBe(404);
    });

    it("refuses a member uploading or removing", async () => {
      expect((await putLogo(member, PNG)).status).toBe(403);
      expect((await member.fetch("/admin/workspace/logo", { method: "DELETE" })).status).toBe(403);
    });

    it("removes the logo and stops serving it", async () => {
      const { logoUrl } = (await workspaces(owner))[0];
      expect((await owner.fetch("/admin/workspace/logo", { method: "DELETE" })).status).toBe(204);
      expect((await workspaces(owner))[0].logoUrl).toBeNull();
      expect((await owner.fetch(String(logoUrl).replace("/api/v1", ""))).status).toBe(404);
    });
  });
});
