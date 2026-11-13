import { cookies, headers } from "next/headers";
import { env } from "../env";
import { query, queryOne } from "../db/client";
import { redis, sessionKey } from "./redis";
import { clientIpFromHeaders } from "./client-ip";
import { newSessionToken, sessionIdFor } from "./session-token";
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
/**
 * How long a new sign-in for this person lasts, in seconds.
 *
 * The workspace chooses (Admin → Authentication, stored as sessionTimeoutHours);
 * the environment's value is only the fallback for a workspace that never set
 * one. It applies to sign-ins from now on — a session already issued keeps the
 * expiry it was given.
 */
export async function sessionLifetimeSeconds(userId: string): Promise<number> {
  const row = await queryOne<{ hours: string | null }>(
    `SELECT w.settings->>'sessionTimeoutHours' AS hours
       FROM users u JOIN workspaces w ON w.id = u.workspace_id WHERE u.id = $1`,
    [userId],
  );
  const hours = Number(row?.hours);
  return Number.isInteger(hours) && hours >= 1 && hours <= 8_760 ? hours * 3_600 : env.sessionTtlSeconds;
}

/** Without "remember me", a sign-in lasts this long at most — and the cookie goes when the browser closes. */
export const SHORT_SESSION_SECONDS = 12 * 3_600;

export async function createSession(
  userId: string,
  request?: Request,
  remember = true,
): Promise<{ token: string; sessionId: string; expiresAt: Date; lifetimeSeconds: number }> {
  // `token` goes to the browser once, in the cookie. `sessionId` — its hash — is
  // the only form that is stored, keyed on, or ever shown.
  const token = newSessionToken();
  const sessionId = sessionIdFor(token);
  // Never longer than the workspace allows, and shorter when the person did not
  // ask to be remembered: the server ends it too, not just the browser.
  const workspaceSeconds = await sessionLifetimeSeconds(userId);
  const lifetimeSeconds = remember ? workspaceSeconds : Math.min(workspaceSeconds, SHORT_SESSION_SECONDS);
  const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000);

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
      (request && clientIpFromHeaders(request.headers)) ?? null,
      expiresAt,
    ],
  );

  await redis.set(sessionKey(sessionId), userId, "EX", lifetimeSeconds);
  await query(`UPDATE users SET last_sign_in_at = now() WHERE id = $1`, [userId]);

  return { token, sessionId, expiresAt, lifetimeSeconds };
}

/**
 * Starts a session for this account and sets the cookie. With `replacing`,
 * the caller's current session ends too — switching workspace or moving into
 * a new one must not leave the old sign-in live behind the new cookie.
 */
export async function signInAs(
  userId: string,
  request: Request,
  replacing?: string,
  remember = true,
): Promise<{ sessionId: string; expiresAt: Date }> {
  const { token, sessionId, expiresAt, lifetimeSeconds } = await createSession(userId, request, remember);
  if (replacing) await destroySession(replacing);
  const store = await cookies();
  store.set(env.sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // No maxAge = a session cookie: the browser drops it when it is closed.
    ...(remember ? { maxAge: lifetimeSeconds } : {}),
  });
  return { sessionId, expiresAt };
}

/** Ends every session a person has, on every device. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const revoked = await query<{ id: string }>(`DELETE FROM sessions WHERE user_id = $1 RETURNING id`, [userId]);
  if (revoked.length) await redis.del(...revoked.map((session) => sessionKey(session.id)));
  return revoked.length;
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
       -- Never across workspaces, whatever row exists: the app must be one of
       -- the user's own workspace.
       JOIN oauth_apps a ON a.id = t.app_id AND a.workspace_id = u.workspace_id
       WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
         AND u.account_status = 'active'
         AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = u.workspace_id AND w.archived_at IS NOT NULL)`,
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
     -- A token acts only as a bot of the workspace it was issued in. Checked
     -- here as well as at issue, so no bad row can ever sign anyone in.
     JOIN users u ON u.id = t.user_id AND u.workspace_id = t.workspace_id AND u.is_bot
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL
       AND u.account_status = 'active'
       AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = u.workspace_id AND w.archived_at IS NOT NULL)`,
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
  const token = store.get(env.sessionCookie)?.value;
  if (!token || token.length > 200) return null;
  const sessionId = sessionIdFor(token);

  let userId = await redis.get(sessionKey(sessionId));

  if (!userId) {
    // Redis is a cache, not the source of truth — fall back and repopulate.
    const row = await queryOne<{ user_id: string; remaining: string }>(
      `SELECT user_id, extract(epoch FROM expires_at - now())::int AS remaining
         FROM sessions WHERE id = $1 AND expires_at > now()`,
      [sessionId],
    );
    if (!row) return null;
    userId = row.user_id;
    // For what is left of it — not a fresh full lifetime, which would quietly
    // extend a session past the expiry it was issued with.
    await redis.set(sessionKey(sessionId), userId, "EX", Math.max(1, Number(row.remaining)));
  }

  const user = await queryOne<UserRow & { workspace_id: string }>(
    // A workspace that has been put away (archived_at) lets nobody in, whatever
    // session they still hold.
    `SELECT ${USER_COLUMNS}, u.workspace_id FROM users u WHERE u.id = $1
       AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = u.workspace_id AND w.archived_at IS NOT NULL)`,
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
  return clientIpFromHeaders(list);
}
