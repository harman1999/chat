import { handler, json, parseBody, problem } from "@server/lib/http";
import { TWO_FACTOR_IP_RULE } from "@server/lib/rate-limit";
import { twoFactorChallengeSchema } from "@server/lib/schemas";
import { readChallenge, setPendingSecret } from "@server/lib/two-factor-challenge";
import { newSetup } from "@server/lib/two-factor-setup";

/**
 * First step of setting up two-factor during sign-in, for a workspace that
 * requires it: a new secret and its QR code. Only for a challenge that said setup
 * was needed — someone who already has it set up is never shown a new secret here.
 */
export const POST = handler(async (request: Request) => {
  const { challenge } = await parseBody(request, twoFactorChallengeSchema);
  const pending = await readChallenge(challenge);
  if (!pending || pending.mode !== "enrol") {
    return problem(401, "challenge_expired", "This sign-in has expired. Enter your email and password again.");
  }
  const { details, secret } = await newSetup(pending.userId);
  await setPendingSecret(challenge, secret);
  return json(details);
}, { rateLimit: TWO_FACTOR_IP_RULE });
