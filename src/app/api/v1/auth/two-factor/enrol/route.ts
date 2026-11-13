import { audit } from "@server/lib/audit";
import { handler, json, parseBody, problem } from "@server/lib/http";
import { consume, reset, TWO_FACTOR_ACCOUNT_RULE, TWO_FACTOR_IP_RULE } from "@server/lib/rate-limit";
import { signInAs } from "@server/lib/session";
import { endChallenge, failChallenge, readChallenge } from "@server/lib/two-factor-challenge";
import { twoFactorVerifySchema } from "@server/lib/schemas";
import { matchingStep } from "@server/lib/totp";
import { twoFactorRepo } from "@server/repo/twoFactor";
import { usersRepo } from "@server/repo/users";

/**
 * Second step of setting up two-factor during sign-in: a code from the new entry
 * proves the phone has it. Only then is anything saved — and only then is the
 * person let in, with their recovery codes to keep.
 */
export const POST = handler(async (request: Request) => {
  const { challenge, code } = await parseBody(request, twoFactorVerifySchema);
  const pending = await readChallenge(challenge);
  if (!pending || pending.mode !== "enrol") {
    return problem(401, "challenge_expired", "This sign-in has expired. Enter your email and password again.");
  }
  if (!pending.pendingSecret) return problem(400, "setup_not_started", "Scan the code first.");

  const subject = `mfa:${pending.userId}`;
  const allowance = await consume(request, TWO_FACTOR_ACCOUNT_RULE, subject);
  if (!allowance.allowed) {
    return problem(429, "rate_limited", "Too many attempts. Try again in a few minutes.", {
      "Retry-After": String(allowance.retryAfterSeconds),
    });
  }

  const step = matchingStep(pending.pendingSecret, code.replace(/\s/g, ""));
  if (step === null) {
    await failChallenge(challenge);
    return problem(401, "invalid_code", "That code is not right. Check the entry in your app and try again.");
  }

  const user = await usersRepo.get(pending.userId);
  const status = await usersRepo.accountStatus(pending.userId);
  if (!user || status === "deactivated") return problem(403, "account_deactivated", "This account has been deactivated");

  const recoveryCodes = await twoFactorRepo.enable(pending.userId, pending.pendingSecret, step);
  await endChallenge(challenge);
  await reset(request, TWO_FACTOR_ACCOUNT_RULE, subject);

  const { expiresAt } = await signInAs(user.id, request, undefined, pending.remember);
  await audit({
    actorId: user.id,
    action: "auth.two_factor_enabled",
    category: "auth",
    severity: "warning",
    target: `${user.email} (required by the workspace)`,
    request,
  });
  return json({ user, expiresAt: expiresAt.toISOString(), recoveryCodes });
}, { rateLimit: TWO_FACTOR_IP_RULE });
