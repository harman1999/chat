import { handler, json, parseBody, problem } from "@server/lib/http";
import { queryOne } from "@server/db/client";
import { audit } from "@server/lib/audit";
import { verifyPassword } from "@server/lib/password";
import { PASSWORD_RULE } from "@server/lib/rate-limit";
import { switchWorkspaceSchema } from "@server/lib/schemas";
import { requireUserSession, signInAs } from "@server/lib/session";

/**
 * Moves to the caller's account in another workspace.
 *
 * Each workspace has its own account, so this is a sign-in to that account —
 * its password, not the current one's — that also ends the current session.
 * Only accounts with the same email are reachable; anything else is "not
 * found", whatever exists there.
 */
export const POST = handler(async (request: Request) => {
  const { user, sessionId, workspaceId } = await requireUserSession();
  const body = await parseBody(request, switchWorkspaceSchema);
  if (body.workspaceId === workspaceId) {
    return problem(400, "invalid_request", "You are already in this workspace");
  }

  const target = await queryOne<{ id: string; password_hash: string | null; account_status: string }>(
    `SELECT id, password_hash, account_status FROM users
      WHERE workspace_id = $1 AND lower(email) = lower($2) AND NOT is_bot`,
    [body.workspaceId, user.email],
  );
  if (!target || target.account_status === "deactivated") {
    return problem(404, "not_found", "You have no account in that workspace");
  }
  if (!target.password_hash || !(await verifyPassword(body.password, target.password_hash))) {
    return problem(403, "invalid_credentials", "That password is incorrect for your account there");
  }

  await signInAs(target.id, request, sessionId);
  await audit({
    actorId: target.id,
    action: "auth.switched_workspace",
    category: "auth",
    severity: "info",
    target: `from ${workspaceId}`,
    request,
  });
  return json({ workspaceId: body.workspaceId });
}, { rateLimit: PASSWORD_RULE });
