import { cookies } from "next/headers";
import { env } from "@server/env";
import { handler, json, parseBody, problem } from "@server/lib/http";
import { consume, LOGIN_ACCOUNT_RULE, LOGIN_IP_RULE, penalise, reset } from "@server/lib/rate-limit";
import { createSession } from "@server/lib/session";
import { verifyPassword } from "@server/lib/password";
import { loginSchema } from "@server/lib/schemas";
import { mapUser } from "@server/repo/users";
import { usersRepo } from "@server/repo/users";

export const POST = handler(async (request: Request) => {
  const body = await parseBody(request, loginSchema);
  const account = `account:${body.email.toLowerCase()}`;

  // The account bucket is checked before any password work is done.
  const allowance = await consume(request, LOGIN_ACCOUNT_RULE, account);
  if (!allowance.allowed) {
    return problem(429, "rate_limited", "Too many sign-in attempts. Try again shortly.", {
      "Retry-After": String(allowance.retryAfterSeconds),
    });
  }

  const row = await usersRepo.findByEmail(env.defaultWorkspaceId, body.email);
  // One message for both cases — never reveal whether an address exists.
  const invalid = problem(401, "invalid_credentials", "Email or password is incorrect");
  if (!row?.password_hash) {
    await penalise(request, LOGIN_ACCOUNT_RULE, account);
    return invalid;
  }
  if (row.account_status === "deactivated") {
    return problem(403, "account_deactivated", "This account has been deactivated");
  }
  if (!(await verifyPassword(body.password, row.password_hash))) {
    await penalise(request, LOGIN_ACCOUNT_RULE, account);
    return invalid;
  }

  // A successful sign-in clears the account bucket, so a few typos before the
  // right password don't leave anyone locked out.
  await reset(request, LOGIN_ACCOUNT_RULE, account);

  const sessionId = await createSession(row.id, request);
  const store = await cookies();
  store.set(env.sessionCookie, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: env.sessionTtlSeconds,
  });

  return json({
    user: mapUser(row),
    accessToken: sessionId,
    expiresAt: new Date(Date.now() + env.sessionTtlSeconds * 1000).toISOString(),
  });
}, { rateLimit: LOGIN_IP_RULE });
