import { audit } from "@server/lib/audit";
import { handler, json, parseBody, problem } from "@server/lib/http";
import { consume, reset, TWO_FACTOR_ACCOUNT_RULE } from "@server/lib/rate-limit";
import { twoFactorCodeSchema } from "@server/lib/schemas";
import { requireUserSession } from "@server/lib/session";
import { matchingStep } from "@server/lib/totp";
import { forgetPendingSecret, pendingSecretFor } from "@server/lib/two-factor-setup";
import { twoFactorRepo } from "@server/repo/twoFactor";

/** Finishes setting up: a code from the new entry proves the phone has it, then it is switched on. */
export const POST = handler(async (request: Request) => {
  const { user } = await requireUserSession();
  const { code } = await parseBody(request, twoFactorCodeSchema);

  const secret = await pendingSecretFor(user.id);
  if (!secret) return problem(400, "setup_not_started", "Setup timed out. Start again.");

  const subject = `mfa:${user.id}`;
  const allowance = await consume(request, TWO_FACTOR_ACCOUNT_RULE, subject);
  if (!allowance.allowed) {
    return problem(429, "rate_limited", "Too many attempts. Try again in a few minutes.", {
      "Retry-After": String(allowance.retryAfterSeconds),
    });
  }

  const step = matchingStep(secret, code.replace(/\s/g, ""));
  if (step === null) return problem(400, "invalid_code", "That code is not right. Check the entry in your app and try again.");

  const recoveryCodes = await twoFactorRepo.enable(user.id, secret, step);
  await forgetPendingSecret(user.id);
  await reset(request, TWO_FACTOR_ACCOUNT_RULE, subject);
  await audit({ actorId: user.id, action: "auth.two_factor_enabled", category: "auth", severity: "warning", target: user.email, request });
  return json({ recoveryCodes });
});
