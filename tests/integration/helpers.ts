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

export async function signIn(email: string, password = DEMO_PASSWORD): Promise<Client> {
  const response = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Sign-in failed for ${email}: ${response.status}`);
  }

  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  const body = (await response.json()) as { user: { id: string } };

  return {
    userId: body.user.id,
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
