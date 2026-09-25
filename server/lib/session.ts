import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { env } from "../env";
import { query, queryOne } from "../db/client";
import { redis, sessionKey } from "./redis";
import { hashSecret } from "./secrets";
import type { User } from "../../src/types";
import { mapUser, USER_COLUMNS, type UserRow } from "../repo/users";

export interface SessionContext {
  /** The bearer token's id when the caller authenticated with one. */
  sessionId: string;
  user: User;
  /**
   * How the caller proved who they are. Routes that must not be driven by an
   * integration check this rather than `user.isBot`, because the distinction
   * that matters is the credential, not the account.
   */
  actor: "user" | "integration";
  /**
   * The caller's workspace, read from their row rather than a server constant.
   * Every authenticated route scopes its queries with this, so the API is not
   * pinned to one tenant.
   */
  workspaceId: string;
}

/**
 * Sessions live in two places on purpose: Postgres is the durable record the
 * "active sessions" screen lists and revokes, Redis is the hot lookup on every
 * request. Redis holding only the user id means a revoked row disappears from
 * both as soon as the key is dropped.
 */
export async function createSession(userId: string, request?: Request): Promise<string> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + env.sessionTtlSeconds * 1000);

  const agent = request?.headers.get("user-agent") ?? "";
  const isMobile = /iPhone|Android|iPad/i.test(agent);

  await query(
    `INSERT INTO sessions (id, user_id, device_kind, device_label, browser, location, ip_address, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      sessionId,
      userId,
      isMobile ? "mobile" : "web",
      agent.slice(0, 120) || "Unknown device",
      agent.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/)?.[0] ?? "",
      "",
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      expiresAt,
    ],
  );

  await redis.set(sessionKey(sessionId), userId, "EX", env.sessionTtlSeconds);
  await query(`UPDATE users SET last_sign_in_at = now() WHERE id = $1`, [userId]);

  return sessionId;
}

export async function destroySession(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
  await query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
}

/**
 * Resolves a bot from `Authorization: Bearer hlx_...`.
 *
 * The token resolves to an ordinary `users` row, so everything downstream —
 * permissions, channel membership, message authorship — behaves exactly as it
 * does for a person. That is the whole point of modelling a bot as a user.
 */
async function getTokenSession(): Promise<SessionContext | null> {
  const list = await headers();
  const header = list.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const presented = header.slice("Bearer ".length).trim();
  if (!presented.startsWith("hlx_")) return null;
  const tokenHash = hashSecret(presented);

  // An OAuth access token acts as the person who granted it, not as a bot.
  if (presented.startsWith("hlx_oat_")) {
    const granted = await queryOne<UserRow & { workspace_id: string; token_id: string }>(
      `SELECT ${USER_COLUMNS}, u.workspace_id, t.id AS token_id
       FROM oauth_access_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
         AND u.account_status = 'active'`,
      [tokenHash],
    );
    if (!granted) return null;
    return {
      sessionId: granted.token_id,
      user: mapUser(granted),
      // Still an integration: an application holding a delegated token must not
      // be able to change the password of the account that delegated to it.
      actor: "integration",
      workspaceId: granted.workspace_id,
    };
  }

  // Looked up by hash rather than compared row by row: the index does the work
  // and no plaintext token is ever held alongside the candidates.
  const row = await queryOne<UserRow & { workspace_id: string; token_id: string }>(
    `SELECT ${USER_COLUMNS}, u.workspace_id, t.id AS token_id
     FROM integration_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL
       AND u.account_status = 'active'`,
    [tokenHash],
  );
  if (!row) return null;

  void query(`UPDATE integration_tokens SET last_used_at = now() WHERE id = $1`, [row.token_id]);

  return {
    sessionId: row.token_id,
    user: mapUser(row),
    actor: "integration",
    workspaceId: row.workspace_id,
  };
}

/** Resolves the caller from a bearer token or the session cookie. */
export async function getSession(): Promise<SessionContext | null> {
  const viaToken = await getTokenSession();
  if (viaToken) return viaToken;

  const store = await cookies();
  const sessionId = store.get(env.sessionCookie)?.value;
  if (!sessionId) return null;

  let userId = await redis.get(sessionKey(sessionId));

  if (!userId) {
    // Redis is a cache, not the source of truth — fall back and repopulate.
    const row = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM sessions WHERE id = $1 AND expires_at > now()`,
      [sessionId],
    );
    if (!row) return null;
    userId = row.user_id;
    await redis.set(sessionKey(sessionId), userId, "EX", env.sessionTtlSeconds);
  }

  const user = await queryOne<UserRow & { workspace_id: string }>(
    `SELECT ${USER_COLUMNS}, u.workspace_id FROM users u WHERE u.id = $1`,
    [userId],
  );
  if (!user) return null;

  void query(`UPDATE sessions SET last_active_at = now() WHERE id = $1`, [sessionId]);

  return { sessionId, user: mapUser(user), actor: "user", workspaceId: user.workspace_id };
}

/**
 * A session that a person is actually driving.
 *
 * A bearer token deliberately resolves to an ordinary user, which means it
 * would otherwise reach every route that user can — including changing their
 * password and revoking their sessions. Anything that manages the account
 * itself, or administers the workspace, requires a real sign-in: a leaked
 * integration token must not be able to take the account over.
 */
export async function requireUserSession(): Promise<SessionContext> {
  const session = await requireSession();
  if (session.actor === "integration") {
    throw new ForbiddenError("This endpoint cannot be used with an integration token");
  }
  return session;
}

/** Throws a 401-shaped error when there is no session; use at the top of handlers. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export class UnauthorizedError extends Error {
  status = 401;
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Not permitted") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function clientIp(): Promise<string | null> {
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
