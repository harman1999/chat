import { handler, json, parseBody, problem } from "@server/lib/http";
import { PASSWORD_RULE } from "@server/lib/rate-limit";
import { twoFactorPasswordSchema } from "@server/lib/schemas";
import { requireUserSession } from "@server/lib/session";
import { newSetup, passwordIsCorrect, rememberPendingSecret } from "@server/lib/two-factor-setup";
import { twoFactorRepo } from "@server/repo/twoFactor";

/**
 * Starts setting up two-factor: a new secret and its QR code, after the password.
 * Nothing is turned on until a code from it is proved at /enable.
 */
export const POST = handler(async (request: Request) => {
  const { user } = await requireUserSession();
  const { password } = await parseBody(request, twoFactorPasswordSchema);
  if (await twoFactorRepo.isEnabled(user.id)) {
    return problem(409, "already_enabled", "Two-factor is already on. Turn it off first to set it up again.");
  }
  if (!(await passwordIsCorrect(user.id, password))) {
    return problem(403, "invalid_credentials", "Password is incorrect");
  }
  const { details, secret } = await newSetup(user.id);
  await rememberPendingSecret(user.id, secret);
  return json(details);
}, { rateLimit: PASSWORD_RULE });
