import { audit } from "@server/lib/audit";
import { handler, json, parseBody, problem } from "@server/lib/http";
import { consume, PASSWORD_RULE, reset, TWO_FACTOR_ACCOUNT_RULE } from "@server/lib/rate-limit";
import { twoFactorConfirmSchema } from "@server/lib/schemas";
import { requireUserSession } from "@server/lib/session";
import { passwordIsCorrect } from "@server/lib/two-factor-setup";
import { twoFactorRepo } from "@server/repo/twoFactor";

/** A new set of recovery codes. The old ones stop working at once. Needs the password and a current code. */
export const POST = handler(async (request: Request) => {
  const { user } = await requireUserSession();
  const { password, code } = await parseBody(request, twoFactorConfirmSchema);

  if (!(await twoFactorRepo.isEnabled(user.id))) return problem(409, "not_enabled", "Two-factor is not turned on.");
  if (!(await passwordIsCorrect(user.id, password))) {
    return problem(403, "invalid_credentials", "Password is incorrect");
  }

  const subject = `mfa:${user.id}`;
  const allowance = await consume(request, TWO_FACTOR_ACCOUNT_RULE, subject);
  if (!allowance.allowed) {
    return problem(429, "rate_limited", "Too many attempts. Try again in a few minutes.", {
      "Retry-After": String(allowance.retryAfterSeconds),
    });
  }
  if (!(await twoFactorRepo.verify(user.id, code))) {
    return problem(403, "invalid_code", "That code is not right, or it has already been used.");
  }

  const recoveryCodes = await twoFactorRepo.regenerateRecoveryCodes(user.id);
  await reset(request, TWO_FACTOR_ACCOUNT_RULE, subject);
  await audit({ actorId: user.id, action: "auth.recovery_codes_regenerated", category: "auth", severity: "warning", target: user.email, request });
  return json({ recoveryCodes });
}, { rateLimit: PASSWORD_RULE });
