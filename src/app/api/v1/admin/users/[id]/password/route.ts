import { handler, json, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { generateTemporaryPassword, hashPassword } from "@server/lib/password";
import { requirePermission } from "@server/lib/permissions";
import { PASSWORD_RULE } from "@server/lib/rate-limit";
import { requireUserSession, revokeAllSessions } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

/**
 * Resets someone's password to a temporary one, returned once.
 *
 * Nothing here can send email, so there is no reset link: the administrator
 * gets the password and passes it on. The person's every session ends, so a
 * forgotten or stolen password stops working immediately. The password is
 * chosen here, never by the client, and appears only in this response — not in
 * the audit log.
 */
export const POST = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireUserSession();
  await requirePermission(user.id, "p_admin_auth");
  const { id } = await ctx.params;

  const password = generateTemporaryPassword();
  const result = await adminRepo.resetPassword({
    workspaceId,
    actorId: user.id,
    targetId: id,
    passwordHash: await hashPassword(password),
  });

  if (!result.ok) {
    switch (result.reason) {
      case "not_found":
        return problem(404, "not_found", "User not found");
      case "self":
        return problem(400, "invalid_request", "Change your own password in Settings");
      case "bot":
        return problem(422, "not_a_person", "Bot accounts sign in with a token, not a password");
      case "outranked":
        return problem(403, "forbidden", "You can only reset the password of someone with a lower role than yours");
    }
  }

  const signedOut = await revokeAllSessions(result.userId);
  await audit({
    actorId: user.id,
    action: "user.password_reset",
    category: "user",
    severity: "critical",
    target: `@${result.username} (${signedOut} sessions ended)`,
    request,
  });

  return json({ password, username: result.username }, { headers: { "Cache-Control": "no-store" } });
}, { rateLimit: PASSWORD_RULE });
