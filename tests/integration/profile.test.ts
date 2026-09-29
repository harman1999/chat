import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, anonFetch, assertServerRunning, BASE_URL, closeDb, db, DEMO_PASSWORD, signIn, type Client } from "./helpers";

/** 1×1 transparent PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

describe("profile photo and email", () => {
  let bob: Client;
  let alice: Client;

  beforeAll(async () => {
    await assertServerRunning();
    bob = await signIn(ACCOUNTS.member);
    alice = await signIn(ACCOUNTS.admin);
  });

  afterAll(async () => {
    // Shares the database with the running app: put Bob back as he was.
    await bob.fetch("/users/me/avatar", { method: "DELETE" });
    await db().query(`UPDATE users SET email = $1 WHERE id = 'u_bob'`, [ACCOUNTS.member]);
    await closeDb();
  });

  const putPhoto = (client: Client, body: Buffer, type = "image/png") =>
    client.fetch("/users/me/avatar", { method: "PUT", body: new Uint8Array(body), headers: { "Content-Type": type } });

  const avatarUrlOf = async (client: Client, id: string) =>
    ((await (await client.fetch(`/users/${id}`)).json()) as { avatarUrl: string | null }).avatarUrl;

  describe("photo", () => {
    it("uploads, and colleagues see it", async () => {
      const response = await putPhoto(bob, PNG);
      expect(response.status).toBe(200);
      const { avatarUrl } = (await response.json()) as { avatarUrl: string };
      expect(await avatarUrlOf(alice, "u_bob")).toBe(avatarUrl);

      const image = await alice.fetch(avatarUrl.replace("/api/v1", ""));
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toBe("image/png");
      expect(image.headers.get("x-content-type-options")).toBe("nosniff");
      expect(Buffer.from(await image.arrayBuffer()).equals(PNG)).toBe(true);
    });

    it("is not served to anyone signed out", async () => {
      expect((await anonFetch("/users/u_bob/avatar")).status).toBe(401);
    });

    it("gets a new URL each time, so caches refetch", async () => {
      const before = await avatarUrlOf(bob, "u_bob");
      await new Promise((resolve) => setTimeout(resolve, 5));
      await putPhoto(bob, PNG);
      expect(await avatarUrlOf(bob, "u_bob")).not.toBe(before);
    });

    it("judges the file by its bytes", async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      expect((await putPhoto(bob, svg, "image/svg+xml")).status).toBe(415);
      expect((await putPhoto(bob, Buffer.from("<html>not an image</html>"), "image/png")).status).toBe(415);
    });

    it("refuses over 2 MB and empty uploads", async () => {
      expect((await putPhoto(bob, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]))).status).toBe(413);
      expect((await putPhoto(bob, Buffer.alloc(0))).status).toBe(400);
    });

    it("changes only your own photo", async () => {
      // There is no route to set anyone else's; Alice's upload lands on Alice.
      await putPhoto(alice, PNG);
      const bobs = await avatarUrlOf(bob, "u_bob");
      const alices = await avatarUrlOf(bob, "u_alice");
      expect(alices).toContain("/users/u_alice/");
      expect(bobs).toContain("/users/u_bob/");
      await alice.fetch("/users/me/avatar", { method: "DELETE" });
    });

    it("removes the photo and stops serving it", async () => {
      const url = await avatarUrlOf(bob, "u_bob");
      expect((await bob.fetch("/users/me/avatar", { method: "DELETE" })).status).toBe(204);
      expect(await avatarUrlOf(bob, "u_bob")).toBeNull();
      expect((await bob.fetch(String(url).replace("/api/v1", ""))).status).toBe(404);
    });
  });

  describe("email", () => {
    const change = (email: string, password = DEMO_PASSWORD) =>
      bob.fetch("/users/me/email", { method: "PUT", body: JSON.stringify({ email, password }) });

    it("needs the current password", async () => {
      expect((await change("bob.new@northwind.io", "wrong-password")).status).toBe(403);
      const row = await db().query<{ email: string }>(`SELECT email FROM users WHERE id = 'u_bob'`);
      expect(row.rows[0].email).toBe(ACCOUNTS.member);
    });

    it("refuses an address someone in the workspace already uses", async () => {
      expect((await change(ACCOUNTS.admin.toUpperCase())).status).toBe(409);
    });

    it("changes it, and sign-in follows the new address", async () => {
      const response = await change("Bob.New@Northwind.io");
      expect(response.status).toBe(200);
      expect(((await response.json()) as { email: string }).email).toBe("bob.new@northwind.io");

      const login = (email: string) =>
        fetch(`${BASE_URL}/api/v1/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: DEMO_PASSWORD }),
        });
      expect((await login("bob.new@northwind.io")).status).toBe(200);
      expect((await login(ACCOUNTS.member)).status).toBe(401);

      const audit = await db().query<{ target: string }>(
        `SELECT target FROM audit_log WHERE action = 'auth.email_changed' AND actor_id = 'u_bob'
          ORDER BY created_at DESC LIMIT 1`,
      );
      expect(audit.rows[0].target).toBe(`${ACCOUNTS.member} → bob.new@northwind.io`);
    });
  });
});
