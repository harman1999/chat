import { cookies } from "next/headers";
import { env } from "../env";
import { increment, logThrottled } from "./metrics";
import { redis } from "./redis";

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
  /** Bucket by caller identity (session, else IP) or strictly by IP. */
  scope?: "identity" | "ip";
  /** Distinguishes buckets when several routes share a scope. */
  name?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter in Redis.
 *
 * Deliberately not a sliding window: a fixed window is two commands and is
 * accurate enough to stop credential stuffing and runaway clients. It lives in
 * the `handler()` wrapper rather than Next middleware because middleware runs on
 * the Edge runtime, where ioredis cannot connect.
 */
export async function consume(
  request: Request | undefined,
  rule: RateLimitRule,
  /** Overrides the derived identity — used to bucket sign-ins by account. */
  subject?: string,
): Promise<RateLimitResult> {
  const identity = subject ?? (await identify(request, rule.scope ?? "identity"));
  const ruleName = rule.name ?? "default";
  const bucket = `ratelimit:${ruleName}:${identity}`;

  try {
    const count = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, rule.windowSeconds);

    if (count > rule.limit) {
      const ttl = await redis.ttl(bucket);
      increment("ratelimit.rejected", ruleName);
      return { allowed: false, remaining: 0, retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds };
    }
    increment("ratelimit.allowed", ruleName);
    return { allowed: true, remaining: rule.limit - count, retryAfterSeconds: 0 };
  } catch (error) {
    // Redis being unavailable must not take the API down with it — but failing
    // open means every limit silently stops applying, which is exactly the
    // state an operator needs told about rather than left to infer.
    increment("ratelimit.degraded", ruleName);
    logThrottled("ratelimit-degraded", 60_000, () =>
      `[ratelimit] Redis unavailable — limits are failing OPEN: ${String(error)}`,
    );
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }
}

/** Clears a bucket — used after a successful sign-in so one typo isn't punished. */
export async function reset(
  request: Request | undefined,
  rule: RateLimitRule,
  subject?: string,
): Promise<void> {
  const identity = subject ?? (await identify(request, rule.scope ?? "identity"));
  await redis.del(`ratelimit:${rule.name ?? "default"}:${identity}`).catch(() => undefined);
}

/** Records a spend without rejecting, for paths that only count failures. */
export async function penalise(
  request: Request | undefined,
  rule: RateLimitRule,
  subject?: string,
): Promise<void> {
  await consume(request, rule, subject);
}

async function identify(request: Request | undefined, scope: "identity" | "ip"): Promise<string> {
  const ip =
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request?.headers.get("x-real-ip") ??
    "unknown";

  if (scope === "ip") return `ip:${ip}`;

  try {
    const store = await cookies();
    const sessionId = store.get(env.sessionCookie)?.value;
    if (sessionId) return `session:${sessionId}`;
  } catch {
    /* outside a request context — fall through to IP */
  }
  return `ip:${ip}`;
}

/** Applied to every route that does not name its own rule. */
export const DEFAULT_RULE: RateLimitRule = {
  limit: 300,
  windowSeconds: 60,
  scope: "identity",
  name: "default",
};

/**
 * Sign-in uses two buckets, because one is always wrong.
 *
 * Per-account is the credential-stuffing defence and can be tight. Per-IP has
 * to be loose: a whole office behind one NAT shares an address, and a tight IP
 * bucket locks out colleagues for someone else's typo. Only *failed* attempts
 * are counted, so normal sign-ins never approach either limit.
 */
export const LOGIN_ACCOUNT_RULE: RateLimitRule = {
  limit: 10,
  windowSeconds: 300,
  scope: "identity",
  name: "login:account",
};

export const LOGIN_IP_RULE: RateLimitRule = {
  limit: 100,
  windowSeconds: 300,
  scope: "ip",
  name: "login:ip",
};

/** Password change re-hashes on every attempt, so it is cheap to abuse. */
export const PASSWORD_RULE: RateLimitRule = {
  limit: 5,
  windowSeconds: 300,
  scope: "identity",
  name: "password",
};

/** Search runs four queries per call. */
export const SEARCH_RULE: RateLimitRule = {
  limit: 60,
  windowSeconds: 60,
  scope: "identity",
  name: "search",
};

/** Uploads buffer the whole body in memory. */
export const UPLOAD_RULE: RateLimitRule = {
  limit: 30,
  windowSeconds: 60,
  scope: "identity",
  name: "upload",
};
