import { queryOne } from "../db/client";
import { ForbiddenError, getSession } from "./session";

/**
 * True when the user's role grants the permission.
 *
 * The role must belong to the user's own workspace. Role ids are global and
 * `users.role_id` has no foreign key, so without that join a role id from
 * another workspace would carry that workspace's powers into this one.
 */
export async function hasPermission(userId: string, permissionId: string): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT true AS ok
     FROM users u
     JOIN roles r ON r.id = u.role_id AND r.workspace_id = u.workspace_id
     JOIN role_permissions rp ON rp.role_id = r.id AND rp.permission_id = $2
     WHERE u.id = $1`,
    [userId, permissionId],
  );
  return Boolean(row);
}

export async function requirePermission(userId: string, permissionId: string): Promise<void> {
  // Every administrative route funnels through here, which makes it the single
  // place to state that administration is not something an integration token
  // does — regardless of what role its bot account happens to hold.
  const session = await getSession();
  if (session?.actor === "integration") {
    throw new ForbiddenError("Administration cannot be performed with an integration token");
  }
  if (!(await hasPermission(userId, permissionId))) {
    throw new ForbiddenError("You do not have permission to do that");
  }
}
