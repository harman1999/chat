import { randomUUID } from "node:crypto";
import { query, queryOne, transaction } from "../db/client";
import type {
  AdminUser,
  AuditLogEntry,
  DailyMetric,
  Permission,
  Role,
  StorageBucket,
  WorkspaceStats,
} from "../../src/types";
import { mapUser, USER_COLUMNS, type UserRow } from "./users";

export const adminRepo = {
  async stats(workspaceId: string): Promise<WorkspaceStats> {
    const row = await queryOne<Record<string, string>>(
      `SELECT
         (SELECT count(*) FROM users WHERE workspace_id = $1 AND account_status <> 'deactivated') AS total_users,
         (SELECT count(*) FROM users WHERE workspace_id = $1 AND account_status = 'active'
            AND last_active_at > now() - interval '7 days') AS active_7d,
         (SELECT count(*) FROM users WHERE workspace_id = $1 AND account_status = 'active'
            AND created_at > now() - interval '30 days') AS new_30d,
         (SELECT count(*) FROM users WHERE workspace_id = $1 AND account_status = 'invited') AS pending_invites,
         (SELECT count(*) FROM users WHERE workspace_id = $1 AND role = 'guest') AS guests,
         (SELECT count(*) FROM channels WHERE workspace_id = $1 AND kind IN ('public','private')) AS total_channels,
         (SELECT count(*) FROM channels WHERE workspace_id = $1 AND kind = 'public') AS public_channels,
         (SELECT count(*) FROM channels WHERE workspace_id = $1 AND kind = 'private') AS private_channels,
         (SELECT count(*) FROM channels WHERE workspace_id = $1 AND is_archived) AS archived_channels,
         (SELECT count(*) FROM messages m JOIN channels c ON c.id = m.channel_id
            WHERE c.workspace_id = $1 AND m.created_at > now() - interval '24 hours') AS messages_24h,
         (SELECT count(*) FROM messages m JOIN channels c ON c.id = m.channel_id
            WHERE c.workspace_id = $1 AND m.created_at > now() - interval '30 days') AS messages_30d,
         (SELECT coalesce(sum(a.size_bytes), 0) FROM attachments a JOIN channels c ON c.id = a.channel_id
            WHERE c.workspace_id = $1) AS storage_used`,
      [workspaceId],
    );

    return {
      totalUsers: Number(row?.total_users ?? 0),
      activeUsers7d: Number(row?.active_7d ?? 0),
      newUsers30d: Number(row?.new_30d ?? 0),
      pendingInvites: Number(row?.pending_invites ?? 0),
      guests: Number(row?.guests ?? 0),
      totalChannels: Number(row?.total_channels ?? 0),
      publicChannels: Number(row?.public_channels ?? 0),
      privateChannels: Number(row?.private_channels ?? 0),
      archivedChannels: Number(row?.archived_channels ?? 0),
      messages24h: Number(row?.messages_24h ?? 0),
      messages30d: Number(row?.messages_30d ?? 0),
      storageUsedBytes: Number(row?.storage_used ?? 0),
      storageQuotaBytes: 1024 ** 4,
    };
  },

  /** Message and active-author counts per day, zero-filled across the range. */
  async activity(workspaceId: string, days: number): Promise<DailyMetric[]> {
    const rows = await query<{ date: string; messages: string; active_users: string }>(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              count(m.id) AS messages,
              count(DISTINCT m.author_id) AS active_users
       FROM generate_series(
              (now() - make_interval(days => $2::int - 1))::date, now()::date, interval '1 day'
            ) AS d(day)
       -- The workspace filter must sit inside the messages join: as its own
       -- LEFT JOIN it kept every workspace's messages and only nulled the channel.
       LEFT JOIN (messages m JOIN channels c ON c.id = m.channel_id AND c.workspace_id = $1)
              ON m.created_at >= d.day AND m.created_at < d.day + interval '1 day'
       GROUP BY d.day ORDER BY d.day`,
      [workspaceId, days],
    );

    return rows.map((row) => ({
      date: row.date,
      messages: Number(row.messages),
      activeUsers: Number(row.active_users),
    }));
  },

  async listUsers(workspaceId: string, limit = 1_000): Promise<AdminUser[]> {
    const rows = await query<
      UserRow & {
        account_status: AdminUser["status"];
        role_id: string | null;
        last_sign_in_at: Date | null;
        two_factor_enabled: boolean;
        created_at: Date;
        message_count: string;
        member_role_id: string | null;
      }
    >(
      `SELECT ${USER_COLUMNS}, u.account_status, u.role_id, u.last_sign_in_at,
              u.two_factor_enabled, u.created_at,
              (SELECT count(*) FROM messages m WHERE m.author_id = u.id) AS message_count,
              (SELECT r.id FROM roles r WHERE r.workspace_id = u.workspace_id AND r.kind = 'member') AS member_role_id
       FROM users u WHERE u.workspace_id = $1 ORDER BY u.display_name
       LIMIT $2`,
      [workspaceId, limit],
    );

    return rows.map((row) => ({
      ...mapUser(row),
      status: row.account_status,
      // No role recorded means the default one — this workspace's Member.
      roleId: row.role_id ?? row.member_role_id ?? "",
      lastSignInAt: row.last_sign_in_at?.toISOString() ?? null,
      twoFactorEnabled: row.two_factor_enabled,
      createdAt: row.created_at.toISOString(),
      messageCount: Number(row.message_count),
    }));
  },

  /**
   * Assigns a role within one workspace. Both the person and the role must be
   * in it; returns false otherwise, so a caller cannot reach across. The legacy
   * `role` column follows the role's kind, and custom roles count as member.
   */
  async setUserRole(workspaceId: string, userId: string, roleId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE users u SET role_id = r.id, role = COALESCE(r.kind, 'member')
         FROM roles r
        WHERE u.id = $2 AND u.workspace_id = $1 AND r.id = $3 AND r.workspace_id = $1
       RETURNING u.id`,
      [workspaceId, userId, roleId],
    );
    return rows.length > 0;
  },

  /**
   * Sets a temporary password for someone in this workspace.
   *
   * Who may reset whom is decided here, not left to the caller: resetting a
   * password is signing in as that person, so an administrator must not be able
   * to take over an owner. Rank is owner > admin > everyone else; you need a
   * higher rank than the person you reset, except that an owner may reset
   * another owner (someone has to when the other forgot theirs). Nobody resets
   * themselves here — that is Settings, which asks for the current password.
   */
  async resetPassword(input: {
    workspaceId: string;
    actorId: string;
    targetId: string;
    passwordHash: string;
  }): Promise<
    | { ok: true; userId: string; username: string }
    | { ok: false; reason: "not_found" | "self" | "bot" | "outranked" }
  > {
    const rows = await query<{ id: string; username: string; is_bot: boolean; kind: string | null }>(
      `SELECT u.id, u.username, u.is_bot, r.kind
         FROM users u LEFT JOIN roles r ON r.id = u.role_id AND r.workspace_id = u.workspace_id
        WHERE u.workspace_id = $1 AND u.id = ANY($2::text[])`,
      [input.workspaceId, [input.actorId, input.targetId]],
    );
    const target = rows.find((row) => row.id === input.targetId);
    const actor = rows.find((row) => row.id === input.actorId);
    if (!target || !actor) return { ok: false, reason: "not_found" };
    if (input.actorId === input.targetId) return { ok: false, reason: "self" };
    // A bot signs in with a token, not a password.
    if (target.is_bot) return { ok: false, reason: "bot" };

    const rank = (kind: string | null) => (kind === "owner" ? 3 : kind === "admin" ? 2 : 1);
    const allowed = actor.kind === "owner" || rank(actor.kind) > rank(target.kind);
    if (!allowed) return { ok: false, reason: "outranked" };

    await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [target.id, input.passwordHash]);
    return { ok: true, userId: target.id, username: target.username };
  },

  /** Within one workspace only; false when the person is not in it. */
  async setUserStatus(workspaceId: string, userId: string, status: AdminUser["status"]): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE users SET account_status = $3 WHERE id = $2 AND workspace_id = $1 RETURNING id`,
      [workspaceId, userId, status],
    );
    return rows.length > 0;
  },

  async listRoles(workspaceId: string): Promise<Role[]> {
    const rows = await query<{
      id: string; name: string; description: string; is_system: boolean;
      kind: Role["kind"]; member_count: string; permission_ids: string[] | null;
    }>(
      `SELECT r.id, r.name, r.description, r.is_system, r.kind,
              (SELECT count(*) FROM users u WHERE u.role_id = r.id AND u.workspace_id = r.workspace_id) AS member_count,
              (SELECT array_agg(rp.permission_id) FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_ids
       FROM roles r WHERE r.workspace_id = $1 ORDER BY r.is_system DESC, r.name
       LIMIT 200`,
      [workspaceId],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isSystem: row.is_system,
      kind: row.kind,
      memberCount: Number(row.member_count),
      permissionIds: row.permission_ids ?? [],
    }));
  },

  async listPermissions(): Promise<Permission[]> {
    const rows = await query<{ id: string; grp: string; label: string; description: string }>(
      `SELECT id, grp, label, description FROM permissions ORDER BY grp, label LIMIT 500`,
    );
    return rows.map((row) => ({
      id: row.id,
      group: row.grp,
      label: row.label,
      description: row.description,
    }));
  },

  /**
   * Creates a custom role, optionally starting from another role's permissions.
   *
   * Copying is the common case: a new role is nearly always "like Member, plus
   * one thing", and starting from nothing means re-ticking twenty boxes.
   */
  async createRole(input: {
    workspaceId: string;
    name: string;
    description: string;
    copyFromRoleId?: string | null;
  }): Promise<
    | { ok: true; roleId: string }
    | { ok: false; reason: "name_taken" | "unknown_source" }
  > {
    // Case-insensitive, because "Reviewer" and "reviewer" side by side in a
    // role picker is a mistake waiting to be assigned.
    const clash = await queryOne<{ id: string }>(
      `SELECT id FROM roles WHERE workspace_id = $1 AND lower(name) = lower($2)`,
      [input.workspaceId, input.name],
    );
    if (clash) return { ok: false, reason: "name_taken" };

    if (input.copyFromRoleId) {
      const source = await queryOne<{ id: string }>(
        `SELECT id FROM roles WHERE id = $1 AND workspace_id = $2`,
        [input.copyFromRoleId, input.workspaceId],
      );
      if (!source) return { ok: false, reason: "unknown_source" };
    }

    const roleId = `role_${randomUUID()}`;
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO roles (id, workspace_id, name, description, is_system)
         VALUES ($1,$2,$3,$4,false)`,
        [roleId, input.workspaceId, input.name, input.description],
      );
      if (input.copyFromRoleId) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           SELECT $1, permission_id FROM role_permissions WHERE role_id = $2`,
          [roleId, input.copyFromRoleId],
        );
      }
    });
    return { ok: true, roleId };
  },

  /**
   * Deletes a custom role, moving its members to a fallback role first.
   *
   * The move is not optional. `users.role_id` carries no foreign key, so
   * deleting the row alone would leave its members pointing at a role that no
   * longer exists — and every permission check for them would quietly fail
   * rather than error. Both happen in one transaction so nobody is ever briefly
   * roleless.
   */
  async deleteRole(input: {
    workspaceId: string;
    roleId: string;
    fallbackRoleId: string;
  }): Promise<
    | { ok: true; movedMembers: number; movedUsernames: string[]; name: string }
    | { ok: false; reason: "not_found" | "system_role" | "bad_fallback" }
  > {
    const role = await queryOne<{ name: string; is_system: boolean }>(
      `SELECT name, is_system FROM roles WHERE id = $1 AND workspace_id = $2`,
      [input.roleId, input.workspaceId],
    );
    if (!role) return { ok: false, reason: "not_found" };
    // The built-in roles are what the rest of the product assumes exists.
    if (role.is_system) return { ok: false, reason: "system_role" };
    if (input.fallbackRoleId === input.roleId) return { ok: false, reason: "bad_fallback" };

    const fallback = await queryOne<{ id: string; kind: string | null }>(
      `SELECT id, kind FROM roles WHERE id = $1 AND workspace_id = $2`,
      [input.fallbackRoleId, input.workspaceId],
    );
    if (!fallback) return { ok: false, reason: "bad_fallback" };

    const moved = await transaction(async (client) => {
      // RETURNING the names, so the audit can say exactly who changed. "3 moved"
      // alone makes a deletion impossible to reconstruct or undo from the log.
      const result = await client.query<{ username: string }>(
        `UPDATE users SET role_id = $2, role = $3 WHERE role_id = $1 AND workspace_id = $4
         RETURNING username`,
        [
          input.roleId,
          input.fallbackRoleId,
          // `role` is the legacy display column; keep it in step.
          fallback.kind ?? "member",
          input.workspaceId,
        ],
      );
      // role_permissions rows go with it (ON DELETE CASCADE).
      await client.query(`DELETE FROM roles WHERE id = $1`, [input.roleId]);
      return result.rows.map((row) => row.username).sort();
    });

    return { ok: true, movedMembers: moved.length, movedUsernames: moved, name: role.name };
  },

  /**
   * Applies a batch of permission-matrix edits, all or nothing.
   *
   * The Save button promises "these N changes". Applying them one request at a
   * time meant a failure halfway left the matrix in a state nobody chose — some
   * edits in, some not. Everything is validated first, then written in one
   * transaction, so the result is either every change or none.
   */
  async applyPermissionChanges(input: {
    workspaceId: string;
    changes: { roleId: string; permissionId: string; granted: boolean }[];
    /** Roles that may never be edited — removing the owner's powers locks everyone out. */
    immutableRoleIds: string[];
  }): Promise<
    | { ok: true; applied: { roleId: string; permissionId: string; granted: boolean }[] }
    | { ok: false; reason: "immutable_role" | "unknown_role" | "unknown_permission"; id: string }
  > {
    const roleIds = [...new Set(input.changes.map((change) => change.roleId))];
    const permissionIds = [...new Set(input.changes.map((change) => change.permissionId))];

    for (const roleId of roleIds) {
      if (input.immutableRoleIds.includes(roleId)) {
        return { ok: false, reason: "immutable_role", id: roleId };
      }
    }

    const knownRoles = new Set(
      (
        await query<{ id: string }>(
          `SELECT id FROM roles WHERE workspace_id = $1 AND id = ANY($2::text[])`,
          [input.workspaceId, roleIds],
        )
      ).map((row) => row.id),
    );
    const missingRole = roleIds.find((id) => !knownRoles.has(id));
    if (missingRole) return { ok: false, reason: "unknown_role", id: missingRole };

    const knownPermissions = new Set(
      (
        await query<{ id: string }>(`SELECT id FROM permissions WHERE id = ANY($1::text[])`, [
          permissionIds,
        ])
      ).map((row) => row.id),
    );
    const missingPermission = permissionIds.find((id) => !knownPermissions.has(id));
    if (missingPermission) return { ok: false, reason: "unknown_permission", id: missingPermission };

    await transaction(async (client) => {
      for (const change of input.changes) {
        if (change.granted) {
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [change.roleId, change.permissionId],
          );
        } else {
          await client.query(
            `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
            [change.roleId, change.permissionId],
          );
        }
      }
    });

    return { ok: true, applied: input.changes };
  },

  async setRolePermission(roleId: string, permissionId: string, granted: boolean): Promise<void> {
    if (granted) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [roleId, permissionId],
      );
    } else {
      await query(`DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`, [
        roleId,
        permissionId,
      ]);
    }
  },

  async storage(workspaceId: string): Promise<StorageBucket[]> {
    const rows = await query<{ kind: string; bytes: string; files: string }>(
      `SELECT a.kind, sum(a.size_bytes) AS bytes, count(*) AS files
       FROM attachments a JOIN channels c ON c.id = a.channel_id
       WHERE c.workspace_id = $1 GROUP BY a.kind ORDER BY sum(a.size_bytes) DESC`,
      [workspaceId],
    );

    const labels: Record<string, string> = {
      image: "Images", document: "Documents", video: "Video",
      audio: "Audio", archive: "Archives", code: "Code",
    };

    return rows.map((row) => ({
      key: row.kind,
      label: labels[row.kind] ?? "Other",
      bytes: Number(row.bytes),
      fileCount: Number(row.files),
    }));
  },

  async auditLog(workspaceId: string): Promise<AuditLogEntry[]> {
    const rows = await query<{
      id: string; actor_id: string | null; action: string; category: AuditLogEntry["category"];
      severity: AuditLogEntry["severity"]; target: string; ip_address: string | null; created_at: Date;
    }>(
      `SELECT id, actor_id, action, category, severity, target, ip_address::text, created_at
       FROM audit_log WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [workspaceId],
    );

    return rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id ?? "",
      action: row.action,
      category: row.category,
      severity: row.severity,
      target: row.target,
      ipAddress: row.ip_address ?? "—",
      createdAt: row.created_at.toISOString(),
    }));
  },

  async settings(workspaceId: string) {
    const row = await queryOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM workspaces WHERE id = $1`,
      [workspaceId],
    );
    return row?.settings ?? {};
  },

  async updateSettings(workspaceId: string, patch: Record<string, unknown>): Promise<void> {
    await query(`UPDATE workspaces SET settings = settings || $2::jsonb WHERE id = $1`, [
      workspaceId,
      JSON.stringify(patch),
    ]);
  },
};
