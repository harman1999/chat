import { queryOne } from "../db/client";
import type { RoleKind } from "../../src/types";

/**
 * The id of one of a workspace's built-in roles.
 *
 * Role ids are global, so "role_member" is Northwind's Member role and no one
 * else's. Code that means "this workspace's Member role" asks here.
 */
export async function roleIdFor(workspaceId: string, kind: RoleKind): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM roles WHERE workspace_id = $1 AND kind = $2`,
    [workspaceId, kind],
  );
  // Every workspace is created with all four (see workspacesRepo.create); a
  // missing one is a broken workspace, not something to paper over.
  if (!row) throw new Error(`Workspace ${workspaceId} has no ${kind} role`);
  return row.id;
}

/** The kind of a role, or null for a custom role or one outside the workspace. */
export async function kindOf(workspaceId: string, roleId: string): Promise<RoleKind | null> {
  const row = await queryOne<{ kind: RoleKind | null }>(
    `SELECT kind FROM roles WHERE id = $1 AND workspace_id = $2`,
    [roleId, workspaceId],
  );
  return row?.kind ?? null;
}
