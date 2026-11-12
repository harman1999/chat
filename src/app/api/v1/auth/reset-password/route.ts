import { handler, noContent, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { sendMail } from "@server/lib/mail";
import { passwordChangedEmail } from "@server/lib/mail-templates";
import { hashPassword } from "@server/lib/password";
import { PASSWORD_RULE } from "@server/lib/rate-limit";
import { resetPasswordSchema } from "@server/lib/schemas";
import { hashSecret } from "@server/lib/secrets";
import { revokeAllSessions } from "@server/lib/session";
import { passwordResetsRepo } from "@server/repo/passwordResets";

/**
 * Sets a new password from an emailed link.
 *
 * The link is spent in the same transaction that changes the password. Every
 * session the person had ends, because someone who needed a reset may have
 * had their password taken. A notice goes to the same address, so a reset the
 * owner did not ask for does not go unseen.
 */
export const POST = handler(async (request: Request) => {
  const { token, newPassword } = await parseBody(request, resetPasswordSchema);

  const person = await passwordResetsRepo.redeem(hashSecret(token), await hashPassword(newPassword));
  if (!person) {
    return problem(400, "invalid_token", "This reset link is invalid, already used, or has expired.");
  }

  const signedOut = await revokeAllSessions(person.userId);
  await audit({
    actorId: person.userId,
    action: "user.password_reset_by_email",
    category: "auth",
    severity: "warning",
    target: `${person.email} (${signedOut} sessions ended)`,
    request,
  });
  void sendMail(passwordChangedEmail({ to: person.email, name: person.name, workspaceName: person.workspaceName }));

  return noContent();
}, { rateLimit: PASSWORD_RULE });
