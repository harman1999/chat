import { audit } from "@server/lib/audit";
import { handler, noContent, problem } from "@server/lib/http";
import { requirePermission } from "@server/lib/permissions";
import { PASSWORD_RULE } from "@server/lib/rate-limit";
import { assertOutranks, rankOfUser } from "@server/lib/rank";
import { requireUserSession, revokeAllSessions } from "@server/lib/session";
import { twoFactorRepo } from "@server/repo/twoFactor";

/**
 * Turns off someone's two-factor sign-in — for a lost phone with no recovery codes left.
 *
 * Like a password reset, it is only for people below the caller's own level, so an
 * administrator cannot strip the Owner's protection. The person's sessions all end:
 * a reset that someone asked an administrator for might be an attacker asking. They
 * sign in with their password, and are asked to set it up again if the workspace
 * requires it.
 */
export const DELETE = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user, workspaceId } = await requireUserSession();
  await requirePermission(user.id, "p_admin_auth");
  const { id } = await ctx.params;
  if (id === user.id) return problem(400, "invalid_request", "Turn off your own two-factor in Settings");

  const [actorRank, targetRank] = await Promise.all([rankOfUser(workspaceId, user.id), rankOfUser(workspaceId, id)]);
  if (!actorRank) return problem(403, "forbidden", "Not permitted");
  if (!targetRank) return problem(404, "not_found", "User not found");
  assertOutranks(actorRank, targetRank, "reset two-factor for");

  if (!(await twoFactorRepo.isEnabled(id))) return problem(409, "not_enabled", "They have not set up two-factor.");
  await twoFactorRepo.disable(id);
  const signedOut = await revokeAllSessions(id);

  await audit({
    actorId: user.id,
    action: "user.two_factor_reset",
    category: "user",
    severity: "critical",
    target: `${id} (${signedOut} sessions ended)`,
    request,
  });
  return noContent();
}, { rateLimit: PASSWORD_RULE });
