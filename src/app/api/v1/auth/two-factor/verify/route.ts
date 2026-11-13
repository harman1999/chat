import { audit } from "@server/lib/audit";
import { handler, json, parseBody, problem } from "@server/lib/http";
import { consume, reset, TWO_FACTOR_ACCOUNT_RULE, TWO_FACTOR_IP_RULE } from "@server/lib/rate-limit";
import { signInAs } from "@server/lib/session";
import { endChallenge, failChallenge, readChallenge } from "@server/lib/two-factor-challenge";
import { twoFactorVerifySchema } from "@server/lib/schemas";
import { twoFactorRepo } from "@server/repo/twoFactor";
import { usersRepo } from "@server/repo/users";

const EXPIRED = "This sign-in has expired. Enter your email and password again.";

/**
 * Second step of signing in: the code from the authenticator app, or one of the
 * recovery codes. The password was proved a moment ago in /auth/login, which handed
 * back the challenge this answers.
 */
export const POST = handler(async (request: Request) => {
  const { challenge, code } = await parseBody(request, twoFactorVerifySchema);
  const pending = await readChallenge(challenge);
  if (!pending || pending.mode !== "verify") return problem(401, "challenge_expired", EXPIRED);

  // Per account, across every challenge: whoever has the password can always ask for another.
  const subject = `mfa:${pending.userId}`;
  const allowance = await consume(request, TWO_FACTOR_ACCOUNT_RULE, subject);
  if (!allowance.allowed) {
    return problem(429, "rate_limited", "Too many attempts. Try again in a few minutes.", {
      "Retry-After": String(allowance.retryAfterSeconds),
    });
  }

  const kind = await twoFactorRepo.verify(pending.userId, code);
  if (!kind) {
    await failChallenge(challenge);
    return problem(401, "invalid_code", "That code is not right, or it has already been used.");
  }

  await endChallenge(challenge);
  await reset(request, TWO_FACTOR_ACCOUNT_RULE, subject);

  const user = await usersRepo.get(pending.userId);
  const status = await usersRepo.accountStatus(pending.userId);
  if (!user || status === "deactivated") return problem(403, "account_deactivated", "This account has been deactivated");

  const { expiresAt } = await signInAs(user.id, request, undefined, pending.remember);
  const recoveryCodesLeft = await twoFactorRepo.recoveryCodesLeft(user.id);
  await audit({
    actorId: user.id,
    action: kind === "recovery" ? "auth.two_factor_recovery_used" : "auth.two_factor_login",
    category: "auth",
    severity: kind === "recovery" ? "warning" : "info",
    target: kind === "recovery" ? `${user.email} (${recoveryCodesLeft} recovery codes left)` : user.email,
    request,
  });

  return json({ user, expiresAt: expiresAt.toISOString(), usedRecoveryCode: kind === "recovery", recoveryCodesLeft });
}, { rateLimit: TWO_FACTOR_IP_RULE });
