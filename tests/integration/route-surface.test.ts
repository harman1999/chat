import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACCOUNTS, anonFetch, assertServerRunning, closeDb, signIn, type Client } from "./helpers";

/**
 * The route table is discovered from the filesystem rather than listed here, so
 * a route added tomorrow is covered by these assertions without anyone
 * remembering to add it. The cost is that every new route must be reachable
 * with the placeholder params below.
 */
const API_ROOT = join(process.cwd(), "src/app/api/v1");

interface Route {
  /** The URL path, with placeholders substituted. */
  path: string;
  /** The source path, with `[id]` segments intact — used in test names. */
  pattern: string;
  method: string;
  /** True when the first path segment is `admin`. */
  isAdmin: boolean;
}

/**
 * Placeholders are real ids where a route needs one to get far enough to
 * answer, and obvious nonsense where it does not. An authorization check must
 * fire before the row is looked up, so a nonexistent id must still give 401 or
 * 403 — never 404, which would leak that the id is unknown.
 */
const PARAMS: Record<string, string> = {
  id: "ch_general",
  rootId: "m_gen_6",
  userId: "u_bob",
  roleId: "role_member",
  permissionId: "perm_channel_create",
  emoji: "%F0%9F%91%8D",
  // Integrations. Deliberately values that do not exist: an authorization
  // check must fire before the lookup, so these must still give 401 or 403.
  secret: "hlx_hook_not-a-real-secret",
  tokenId: "tok_does_not_exist",
};

function discover(dir = API_ROOT, segments: string[] = []): Route[] {
  const routes: Route[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      routes.push(...discover(full, [...segments, entry]));
    } else if (entry === "route.ts") {
      const source = readFileSync(full, "utf8");
      const methods = [...source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)].map(
        (match) => match[1],
      );
      const pattern = `/${segments.join("/")}`;
      const path = `/${segments
        .map((segment) => {
          const param = segment.match(/^\[(?:\.\.\.)?(.+)\]$/);
          if (!param) return segment;
          const value = PARAMS[param[1]];
          if (!value) throw new Error(`No placeholder for [${param[1]}] in ${pattern}`);
          return value;
        })
        .join("/")}`;
      for (const method of methods) {
        routes.push({ path, pattern, method, isAdmin: segments[0] === "admin" });
      }
    }
  }
  return routes;
}

const ROUTES = discover();
/**
 * Signing in must work without a session, and signing out is deliberately
 * idempotent — clearing a cookie that is already absent is a success, not an
 * error, so it answers 204 rather than 401.
 */
const PUBLIC = new Set([
  "POST /auth/login",
  "POST /auth/logout",
  /**
   * Authenticated by the secret in the path rather than by a session — that is
   * the point of a webhook URL. It answers 404 for an unknown secret, which is
   * also the answer for a disabled one, so the endpoint cannot be used to
   * discover which secrets exist.
   */
  "POST /hooks/[secret]",
  /**
   * Authenticated by client credentials in the form body, per RFC 6749, and it
   * answers with `error`/`error_description` rather than this API's problem
   * shape because OAuth clients expect that.
   */
  "POST /oauth/token",
]);

describe("route surface", () => {
  let member: Client;

  beforeAll(async () => {
    await assertServerRunning();
    member = await signIn(ACCOUNTS.member);
  });

  afterAll(closeDb);

  it("discovered every route in the app directory", () => {
    // A guard on the guard: if the walker silently stops finding routes, the
    // table-driven tests below all pass vacuously.
    expect(ROUTES.length).toBeGreaterThan(60);
    expect(ROUTES.some((route) => route.pattern === "/auth/login")).toBe(true);
  });

  describe.each(ROUTES.filter((route) => !PUBLIC.has(`${route.method} ${route.pattern}`)))(
    "$method $pattern",
    ({ path, method }) => {
      it("refuses an anonymous caller", async () => {
        const response = await anonFetch(path, {
          method,
          body: method === "GET" || method === "DELETE" ? undefined : "{}",
        });
        // 401 specifically: a 400 would mean the body was parsed before the
        // session was checked, and a 404 would confirm or deny the id.
        expect(response.status).toBe(401);
      });
    },
  );

  describe.each(ROUTES.filter((route) => route.isAdmin))("$method $pattern", ({ path, method }) => {
    it("refuses an ordinary member", async () => {
      const response = await member.fetch(path, {
        method,
        body: method === "GET" || method === "DELETE" ? undefined : "{}",
      });
      expect(response.status).toBe(403);
    });
  });
});
