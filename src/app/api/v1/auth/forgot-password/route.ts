import { handler, json, parseBody, problem } from "@server/lib/http";
import { mailEnabled, sendMail } from "@server/lib/mail";
import { passwordResetEmail } from "@server/lib/mail-templates";
import { consume, FORGOT_ACCOUNT_RULE, FORGOT_IP_RULE } from "@server/lib/rate-limit";
import { generateSecret } from "@server/lib/secrets";
import { env } from "@server/env";
import { forgotPasswordSchema } from "@server/lib/schemas";
import { passwordResetsRepo, RESET_LINK_MINUTES } from "@server/repo/passwordResets";
import { ssoRepo } from "@server/repo/sso";
import { usersRepo } from "@server/repo/users";

/** Same words whether or not the address has an account. */
const ACCEPTED = {
  message: "If that address has an account, a reset link is on its way.",
};

/**
 * Emails a password reset link.
 *
 * It must not reveal which addresses have accounts, so the answer is the same
 * for every address and comes back before any lookup or sending happens — the
 * work runs afterwards, so the response time says nothing either. An email
 * with accounts in several workspaces gets one link per workspace.
 *
 * The one thing it does say is that mail is not set up at all: that is about
 * the install, not about any address.
 */
export const POST = handler(async (request: Request) => {
  const body = await parseBody(request, forgotPasswordSchema);
  if (!mailEnabled()) {
    return problem(
      503,
      "mail_unavailable",
      "Resetting by email is not set up here. Ask a workspace administrator to reset your password.",
    );
  }

  const allowance = await consume(request, FORGOT_ACCOUNT_RULE, `account:${body.email.toLowerCase()}`);
  if (allowance.allowed) void deliver(body.email);

  return json(ACCEPTED, { status: 202 });
}, { rateLimit: FORGOT_IP_RULE });

async function deliver(email: string): Promise<void> {
  try {
    const accounts = (await usersRepo.accountsForSignIn(email)).filter(
      (row) => row.account_status !== "deactivated",
    );
    for (const account of accounts) {
      // Where single sign-on is required a password would not get them in, so a
      // reset link would only mislead. The owner can still use one.
      if (account.role !== "owner" && (await ssoRepo.isEnforced(account.workspace_id))) continue;
      const secret = generateSecret("reset");
      await passwordResetsRepo.create(account.id, secret.hash);
      await sendMail(
        passwordResetEmail({
          to: account.email,
          name: account.display_name,
          workspaceName: account.workspace_name,
          url: `${env.publicUrl}/reset-password?token=${encodeURIComponent(secret.plaintext)}`,
          minutes: RESET_LINK_MINUTES,
        }),
      );
    }
  } catch (error) {
    console.error("[forgot-password] could not deliver:", String(error));
  }
}
