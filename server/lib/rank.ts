import { query, queryOne } from "../db/client";
import { ForbiddenError } from "./session";

/**
 * Who may act on whom.
 *
 * Holding a permission such as "manage roles" says what someone may do, not to
 * whom. Without a rank, an administrator could make themselves Owner, demote the
 * Owner, or deactivate them — taking over the workspace with a permission they
 * were meant to use on members. So: the Owner ranks above everyone, an
 * Administrator above everyone else, and anyone with a custom role, Moderator,
 * Member or Guest alike at the bottom. A person may only act on someone ranked
 * below them, and only hand out roles ranked below their own; the Owner is the
 * exception for the roles, since only an Owner can make another one.
 */
export type Rank = 1 | 2 | 3;
export const OWNER_RANK: Rank = 3;

export function rankOfKind(kind: string | null): Rank {
  return kind === "owner" ? 3 : kind === "admin" ? 2 : 1;
}

export async function rankOfUser(workspaceId: string, userId: string): Promise<Rank | null> {
  const row = await queryOne<{ kind: string | null }>(
    `SELECT r.kind FROM users u
       LEFT JOIN roles r ON r.id = u.role_id AND r.workspace_id = u.workspace_id
      WHERE u.id = $1 AND u.workspace_id = $2`,
    [userId, workspaceId],
  );
  return row ? rankOfKind(row.kind) : null;
}

/** Null when there is no such role in this workspace. */
export async function rankOfRole(workspaceId: string, roleId: string): Promise<Rank | null> {
  const row = await queryOne<{ kind: string | null }>(
    `SELECT kind FROM roles WHERE id = $1 AND workspace_id = $2`,
    [roleId, workspaceId],
  );
  return row ? rankOfKind(row.kind) : null;
}

export async function permissionsHeldBy(userId: string): Promise<Set<string>> {
  const rows = await query<{ permission_id: string }>(
    `SELECT rp.permission_id FROM users u
       JOIN roles r ON r.id = u.role_id AND r.workspace_id = u.workspace_id
       JOIN role_permissions rp ON rp.role_id = r.id
      WHERE u.id = $1`,
    [userId],
  );
  return new Set(rows.map((row) => row.permission_id));
}

/** Refuses unless the actor outranks the person they are acting on (the Owner outranks all but themselves). */
export function assertOutranks(actorRank: Rank, targetRank: Rank, what: string): void {
  if (actorRank !== OWNER_RANK && targetRank >= actorRank) {
    throw new ForbiddenError(`You can only ${what} people below your own level`);
  }
}

/** Refuses a role the actor may not hand out: below their own, or any role for the Owner. */
export function assertMayAssign(actorRank: Rank, roleRank: Rank): void {
  if (actorRank !== OWNER_RANK && roleRank >= actorRank) {
    throw new ForbiddenError("You can only assign roles below your own level");
  }
}
