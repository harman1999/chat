import { handler, json, parseBody, problem } from "@server/lib/http";
import { consume, LOGIN_ACCOUNT_RULE, LOGIN_IP_RULE, penalise, reset } from "@server/lib/rate-limit";
import { signInAs } from "@server/lib/session";
import { hashPassword, verifyPassword } from "@server/lib/password";
import { loginSchema } from "@server/lib/schemas";
import { mapUser, usersRepo } from "@server/repo/users";

let decoy: Promise<string> | undefined;
function decoyHash(): Promise<string> {
  decoy ??= hashPassword("decoy-password-that-matches-nothing");
  return decoy;
}

/**
 * Signs in.
 *
 * Each workspace has its own accounts, so one email can have several — with
 * different passwords. The password is tried against each, and:
 * - one account accepts it: signed in to that workspace;
 * - several do: the caller is asked which workspace (409 choose_workspace),
 *   and signs in again naming it. Only then is the list shown — the password
 *   has already been proven, so it tells them nothing they could not see by
 *   signing in to each;
 * - none do: the same 401 as an unknown address, so neither reveals which
 *   addresses have accounts.
 */
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

  const candidates = (await usersRepo.accountsForSignIn(body.email, body.workspace)).filter(
    (row) => row.password_hash,
  );
  const matches = [];
  for (const row of candidates) {
    if (await verifyPassword(body.password, row.password_hash as string)) matches.push(row);
  }
  // With no account, still spend one hash's time, so the response time does
  // not tell an unknown address from a wrong password.
  if (candidates.length === 0) await verifyPassword(body.password, await decoyHash());

  if (matches.length === 0) {
    await penalise(request, LOGIN_ACCOUNT_RULE, account);
    // One message for every case — never reveal whether an address exists.
    return problem(401, "invalid_credentials", "Email or password is incorrect");
  }

  // A successful sign-in clears the account bucket, so a few typos before the
  // right password don't leave anyone locked out.
  await reset(request, LOGIN_ACCOUNT_RULE, account);

  // Said only after the password is proven, so it does not reveal who has an
  // account — and only when no active account matched, so a deactivated one
  // elsewhere never gets in the way.
  const active = matches.filter((row) => row.account_status !== "deactivated");
  if (active.length === 0) {
    return problem(403, "account_deactivated", "This account has been deactivated");
  }

  if (active.length > 1) {
    return json(
      {
        code: "choose_workspace",
        message: "This email has accounts in more than one workspace. Choose one.",
        status: 409,
        // Names only: logos are served to members, and this person is not
        // signed in yet.
        workspaces: active.map((row) => ({ slug: row.workspace_slug, name: row.workspace_name })),
      },
      { status: 409 },
    );
  }

  const [row] = active;
  const { sessionId, expiresAt } = await signInAs(row.id, request);
  return json({
    user: mapUser(row),
    accessToken: sessionId,
    expiresAt: expiresAt.toISOString(),
  });
}, { rateLimit: LOGIN_IP_RULE });

