import Redis from "ioredis";
import { Pool } from "pg";

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

/**
 * Tests drive the app over HTTP rather than importing route handlers, because
 * the handlers depend on `next/headers` request context. Going through the
 * network also means we assert on what actually ships — routing, cookies and
 * all.
 */
export interface Client {
  userId: string;
  cookie: string;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

export const DEMO_PASSWORD = "helix-demo-password";

export async function assertServerRunning(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/v1/auth/me`);
  } catch {
    throw new Error(
      `No server at ${BASE_URL}. Start it with \`npm run dev\` before running the tests.`,
    );
  }
}

/**
 * Signs in to the Northwind account by default. Named explicitly because an
 * email can have accounts in several workspaces — the multi-workspace tests
 * create one — and then sign-in asks which.
 */
/**
 * The address this test file signs in from, as far as the rate limiter can tell.
 *
 * Sign-ins are limited to 100 per five minutes per address, and every file in
 * the suite used to sign in from the same one (localhost). The suite grew past
 * 100 sign-ins, and whichever files ran last were refused with 429 — a failure
 * that looked like a broken feature and was only arithmetic. Each file now gets
 * its own address (the limiter reads X-Forwarded-For), so a file can sign in as
 * often as it needs without spending anyone else's allowance. Vitest loads this
 * module fresh per file, so the address differs per file.
 */
const TEST_IP = `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;

export async function signIn(email: string, password = DEMO_PASSWORD, workspace = "northwind"): Promise<Client> {
  const response = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": TEST_IP },
    body: JSON.stringify({ email, password, workspace }),
  });

  if (!response.ok) {
    throw new Error(`Sign-in failed for ${email}: ${response.status}`);
  }

  const body = (await response.json()) as { user: { id: string } };
  return asClient(sessionCookieOf(response), body.user.id);
}

/** The `name=value` of the session cookie a response set. */
export function sessionCookieOf(response: Response): string {
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

/** A client for a cookie some other request produced — creating or switching workspace. */
export function asClient(cookie: string, userId: string): Client {
  return {
    userId,
    cookie,
    fetch: (path, init = {}) =>
      fetch(`${BASE_URL}/api/v1${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
      }),
  };
}

/** Unauthenticated request, for asserting that endpoints require a session. */
export function anonFetch(path: string, init: RequestInit = {}) {
  return fetch(`${BASE_URL}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

let pool: Pool | undefined;

/** Direct database access, for arranging state and asserting side effects. */
export function db(): Pool {
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgresql://helix:helix@localhost:5434/helix",
    max: 4,
  });
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export const ACCOUNTS = {
  owner: "harman.singh@northwind.io",
  admin: "alice.johnson@northwind.io",
  member: "bob.smith@northwind.io",
} as const;

let client: Redis | undefined;

/** Direct Redis access, for clearing state a test deliberately dirtied. */
export function cache(): Redis {
  client ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6381");
  return client;
}

export async function closeCache(): Promise<void> {
  await client?.quit();
  client = undefined;
}

/**
 * Clears a fixed-window bucket.
 *
 * A test that spends a limit leaves the account locked out for the rest of the
 * window — which outlives the test run and breaks the next one.
 */
export async function clearRateLimit(rule: string, subject: string): Promise<void> {
  await cache().del(`ratelimit:${rule}:${subject}`);
}
