import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, assertServerRunning, closeDb, signIn, type Client } from "./helpers";

/**
 * A custom status ("Lunch") and availability (online / away / do not disturb)
 * are two different things stored in two different places. Both must survive a
 * round trip through the account, and neither may let junk in.
 */
describe("status and availability", () => {
  let bob: Client;
  let alice: Client;

  const put = (client: Client, path: string, body: unknown) =>
    client.fetch(path, { method: "PUT", body: JSON.stringify(body) });
  const me = async (client: Client) =>
    (await (await client.fetch("/auth/me")).json()) as {
      presence: string;
      customStatus: { emoji: string; text: string; expiresAt: string | null } | null;
    };

  beforeAll(async () => {
    await assertServerRunning();
    bob = await signIn(ACCOUNTS.member);
    alice = await signIn(ACCOUNTS.admin);
  });

  afterAll(async () => {
    // Leave both accounts as found: no status, available.
    await put(bob, "/users/me/status", null);
    await put(bob, "/users/me/presence", { status: "online" });
    await closeDb();
  });

  it("saves a status and returns it on the account", async () => {
    expect((await put(bob, "/users/me/status", { emoji: "🍽", text: "Lunch", expiresAt: null })).status).toBe(204);
    expect((await me(bob)).customStatus).toEqual({ emoji: "🍽", text: "Lunch", expiresAt: null });
  });

  it("changes the status rather than adding to it", async () => {
    await put(bob, "/users/me/status", { emoji: "🎧", text: "Heads down", expiresAt: null });
    await put(bob, "/users/me/status", { emoji: "🌴", text: "On leave", expiresAt: null });
    expect((await me(bob)).customStatus?.text).toBe("On leave");
  });

  it("clears the status with null, or with text that is only spaces", async () => {
    await put(bob, "/users/me/status", { emoji: "🍽", text: "Lunch" });
    expect((await put(bob, "/users/me/status", null)).status).toBe(204);
    expect((await me(bob)).customStatus).toBeNull();

    await put(bob, "/users/me/status", { emoji: "🍽", text: "Lunch" });
    await put(bob, "/users/me/status", { emoji: "🍽", text: "   " });
    expect((await me(bob)).customStatus).toBeNull();
  });

  it("keeps an expiry time and refuses text that is too long", async () => {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    await put(bob, "/users/me/status", { emoji: "⏳", text: "Back soon", expiresAt });
    expect((await me(bob)).customStatus?.expiresAt).toBe(expiresAt);

    expect((await put(bob, "/users/me/status", { emoji: "x", text: "a".repeat(101) })).status).toBe(400);
    expect((await put(bob, "/users/me/status", { emoji: "x", text: "ok", expiresAt: "tomorrow" })).status).toBe(400);
  });

  it("changes availability to each allowed value and reads it back", async () => {
    for (const status of ["away", "dnd", "offline", "online"] as const) {
      expect((await put(bob, "/users/me/presence", { status })).status).toBe(204);
      expect((await me(bob)).presence).toBe(status);
    }
  });

  it("refuses an availability that is not one of the allowed values", async () => {
    expect((await put(bob, "/users/me/presence", { status: "invisible" })).status).toBe(400);
    expect((await put(bob, "/users/me/presence", {})).status).toBe(400);
  });

  it("does not let status or availability be changed without signing in", async () => {
    const anon = (path: string, body: unknown) =>
      fetch(`${process.env.TEST_BASE_URL ?? "http://localhost:3000"}/api/v1${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await anon("/users/me/status", null)).status).toBe(401);
    expect((await anon("/users/me/presence", { status: "away" })).status).toBe(401);
  });

  it("changes only your own: one person's change never reaches another's account", async () => {
    await put(alice, "/users/me/presence", { status: "online" });
    await put(bob, "/users/me/presence", { status: "dnd" });
    await put(bob, "/users/me/status", { emoji: "🍽", text: "Lunch" });
    const other = await me(alice);
    expect(other.presence).toBe("online");
    expect(other.customStatus?.text).not.toBe("Lunch");
  });
});
