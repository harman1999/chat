import { NextResponse } from "next/server";
import { env } from "../env";
import type { ZodType } from "zod";
import { BusyError } from "./busy";
import { consume, DEFAULT_RULE, type RateLimitRule } from "./rate-limit";
import { ForbiddenError, UnauthorizedError } from "./session";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function problem(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
) {
  return NextResponse.json({ code, message, status }, { status, headers });
}

export interface HandlerOptions {
  /** Overrides the default allowance; pass `false` to opt out entirely. */
  rateLimit?: RateLimitRule | false;
  /**
   * Accept state-changing requests from other origins. Only for endpoints that
   * other servers call by design (webhook receivers, the OAuth token endpoint),
   * which authenticate by a secret in the request rather than by cookie.
   */
  allowCrossOrigin?: boolean;
}

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Whether a browser is sending this change from a page on another origin.
 *
 * The session cookie is SameSite=Lax, which stops other *sites* but not other
 * origins on the same site (another port on localhost, a sibling subdomain), so
 * the origin is checked as well. A browser always sends Origin on a cross-origin
 * POST/PUT/PATCH/DELETE; its absence means a script or server, which holds no
 * ambient cookie to abuse. "null" (sandboxed frames) is refused.
 */
function isCrossOriginChange(request: Request): boolean {
  if (READ_ONLY_METHODS.has(request.method)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const host = new URL(origin).host;
    return host !== new URL(env.publicUrl).host && host !== request.headers.get("host");
  } catch {
    return true;
  }
}

/**
 * Wraps a handler so thrown auth and validation errors become responses, and
 * anything else becomes a 500 without leaking internals.
 *
 * Also the rate-limit chokepoint: every route already passes through here, and
 * it runs on the Node runtime where Redis is reachable.
 */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
  options: HandlerOptions = {},
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      const incoming = args[0] instanceof Request ? args[0] : undefined;
      // A NUL in a path segment or query value would reach Postgres and fail
      // there as a 500; it is never valid input.
      if (incoming && /%00|\u0000/i.test(incoming.url)) {
        return problem(400, "invalid_request", "The address contains a character that is not allowed");
      }
      if (incoming && !options.allowCrossOrigin && isCrossOriginChange(incoming)) {
        return problem(403, "cross_origin", "Requests from another origin are not allowed");
      }
      const rule = options.rateLimit === undefined ? DEFAULT_RULE : options.rateLimit;
      if (rule) {
        const request = args[0] instanceof Request ? args[0] : undefined;
        const outcome = await consume(request, rule);
        if (!outcome.allowed) {
          return NextResponse.json(
            { code: "rate_limited", message: "Too many requests", status: 429 },
            { status: 429, headers: { "Retry-After": String(outcome.retryAfterSeconds) } },
          );
        }
      }

      return await fn(...args);
    } catch (error) {
      if (error instanceof BusyError) {
        return problem(503, "busy", "The server is busy. Try again in a moment.", { "Retry-After": "2" });
      }
      if (error instanceof UnauthorizedError) {
        return problem(401, "unauthorized", "Not signed in");
      }
      if (error instanceof ForbiddenError) {
        return problem(403, "forbidden", error.message);
      }
      if (error instanceof NotFoundError) {
        return problem(404, "not_found", error.message);
      }
      if (error instanceof ValidationError) {
        return NextResponse.json(
          { code: "invalid_request", message: error.message, status: 400, issues: error.issues },
          { status: 400 },
        );
      }
      console.error("[api]", error);
      return problem(500, "internal_error", "Something went wrong");
    }
  };
}

/**
 * Turned into a 404 by `handler`. Used where the honest answer is 403 but
 * saying so would confirm that something exists — a message in a channel the
 * caller cannot see, or anything in another workspace.
 */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown by `parseBody`; turned into a 400 by `handler`.
 *
 * Carries the field-level detail so a client can show it against the right
 * input rather than as a generic failure.
 */
export class ValidationError extends Error {
  status = 400;
  constructor(public readonly issues: { path: string; message: string }[]) {
    super("Request body is invalid");
    this.name = "ValidationError";
  }
}

/** Bodies larger than this are rejected before parsing. */
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Reads and throws away a refused request's body, up to a cap.
 *
 * Answering 413 and leaving the body unread strands the connection: the next
 * request on it was reset about five seconds later. Chunks are dropped as they
 * arrive, so nothing is buffered, and past the cap the rest is cancelled.
 */
export async function discardBody(request: Request, cap = 16 * 1024 * 1024): Promise<void> {
  const reader = request.body?.getReader();
  if (reader) await drain(reader, cap);
}

async function drain(reader: ReadableStreamDefaultReader<Uint8Array>, cap = 16 * 1024 * 1024): Promise<void> {
  let seen = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      seen += value.byteLength;
      if (seen > cap) return void (await reader.cancel());
    }
  } catch {
    /* the client went away; nothing left to drain */
  }
}

/**
 * Reads a request body, refusing it as soon as it passes `maxBytes`.
 *
 * Counted as the bytes arrive, not taken from Content-Length: a client that
 * sends the body in chunks declares no length, and trusting the header let a
 * 60 MB "JSON" body past a 1 MB limit. Returns null when it is too large (the
 * rest is drained, so the connection stays usable for the 413 to be read).
 */
export async function readBytes(request: Request, maxBytes: number): Promise<Buffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await drain(reader);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Text containing U+0000 cannot be stored by Postgres; refuse it up front rather than 500 later. */
function containsNul(value: unknown, depth = 0): boolean {
  if (depth > 64) return true; // nothing legitimate nests this deep
  if (typeof value === "string") return value.includes("\0");
  if (Array.isArray(value)) return value.some((item) => containsNul(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, item]) => key.includes("\0") || containsNul(item, depth + 1));
  }
  return false;
}

/**
 * Parses and validates a JSON body against a schema.
 *
 * Replaces the previous `readJson<T>`, whose generic was a compile-time cast
 * and which returned `{}` on a parse failure — so a malformed body silently
 * became an empty object and every "required field" check was the only real
 * validation in the system.
 */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const bytes = await readBytes(request, MAX_BODY_BYTES);
  if (!bytes) throw new ValidationError([{ path: "", message: "Request body is too large" }]);

  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ValidationError([{ path: "", message: "Body must be valid JSON" }]);
  }
  if (containsNul(raw)) {
    throw new ValidationError([{ path: "", message: "Text contains a character that is not allowed" }]);
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
