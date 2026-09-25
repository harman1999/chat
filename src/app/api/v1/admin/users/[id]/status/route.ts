import { handler, noContent, parseBody, problem } from "@server/lib/http";
import { query } from "@server/db/client";
import { redis, sessionKey } from "@server/lib/redis";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { accountStatusSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { adminRepo } from "@server/repo/admin";

export const PUT = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  await requirePermission(user.id, "p_user_deactivate");
  const { id } = await ctx.params;
  const body = await parseBody(request, accountStatusSchema);
  if (id === user.id) return problem(400, "invalid_request", "You cannot change your own status");

  await adminRepo.setUserStatus(id, body.status);

  // Deactivating must take effect immediately, not at session expiry.
  if (body.status === "deactivated") {
    const revoked = await query<{ id: string }>(
      `DELETE FROM sessions WHERE user_id = $1 RETURNING id`,
      [id],
    );
    if (revoked.length) await redis.del(...revoked.map((session) => sessionKey(session.id)));
  }

  await audit({
    actorId: user.id,
    action: body.status === "deactivated" ? "user.deactivated" : "user.status_changed",
    category: "user",
    severity: body.status === "deactivated" ? "warning" : "info",
    target: `${id} → ${body.status}`,
    request,
  });
  return noContent();
});
