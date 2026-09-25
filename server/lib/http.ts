import { NextResponse } from "next/server";
import type { ZodType } from "zod";
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
      if (error instanceof UnauthorizedError) {
        return problem(401, "unauthorized", "Not signed in");
      }
      if (error instanceof ForbiddenError) {
        return problem(403, "forbidden", error.message);
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
 * Parses and validates a JSON body against a schema.
 *
 * Replaces the previous `readJson<T>`, whose generic was a compile-time cast
 * and which returned `{}` on a parse failure — so a malformed body silently
 * became an empty object and every "required field" check was the only real
 * validation in the system.
 */
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    throw new ValidationError([{ path: "", message: "Request body is too large" }]);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError([{ path: "", message: "Body must be valid JSON" }]);
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
