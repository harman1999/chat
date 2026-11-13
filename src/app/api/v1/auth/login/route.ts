import { handler, json, parseBody, problem } from "@server/lib/http";
import { consume, LOGIN_ACCOUNT_RULE, LOGIN_IP_RULE, penalise, reset } from "@server/lib/rate-limit";
import { signInAs } from "@server/lib/session";
import { query } from "@server/db/client";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "@server/lib/password";
import { loginSchema } from "@server/lib/schemas";
import { createChallenge } from "@server/lib/two-factor-challenge";
import { ssoRepo } from "@server/repo/sso";
import { twoFactorRepo } from "@server/repo/twoFactor";
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
    if (await verifyPassword(body.password, row.password_hash as string)) {
      matches.push(row);
    } else if (passwordNeedsRehash(row.password_hash as string)) {
      // A wrong guess against an older, cheaper hash would be answered faster
      // than one against an unknown address (which pays the full current cost),
      // and that difference would say which addresses have accounts. Pay it here.
      await verifyPassword(body.password, await decoyHash());
    }
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
  // With single sign-on required, passwords stop working — except for the owner,
  // who must always be able to get in if the provider is down or misconfigured.
  // Said only after the password is proven, like the other account-specific answers.
  if (row.role !== "owner" && (await ssoRepo.isEnforced(row.workspace_id))) {
    return problem(403, "sso_required", "Your workspace requires single sign-on. Use the single sign-on button.");
  }
  // The password is proven, so this is the one moment its plaintext is on hand
  // to redo an older, cheaper hash at the current cost.
  if (passwordNeedsRehash(row.password_hash as string)) {
    await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [row.id, await hashPassword(body.password)]);
  }
  // The password alone is not enough here. No session is issued yet: the browser
  // gets a short-lived challenge to answer with a code (or, where the workspace
  // requires two-factor and this person has not set it up, to set it up first).
  if (await twoFactorRepo.isEnabled(row.id)) {
    return json(
      {
        code: "two_factor_required",
        message: "Enter the code from your authenticator app.",
        status: 403,
        challenge: await createChallenge(row.id, "verify", body.remember),
      },
      { status: 403 },
    );
  }
  if (await twoFactorRepo.isRequired(row.workspace_id)) {
    return json(
      {
        code: "two_factor_setup_required",
        message: "Your workspace requires two-factor sign-in. Set it up to continue.",
        status: 403,
        challenge: await createChallenge(row.id, "enrol", body.remember),
      },
      { status: 403 },
    );
  }
  const { expiresAt } = await signInAs(row.id, request, undefined, body.remember);
  return json({
    user: mapUser(row),
    expiresAt: expiresAt.toISOString(),
  });
}, { rateLimit: LOGIN_IP_RULE });

