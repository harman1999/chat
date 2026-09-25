import { query, queryOne } from "../db/client";
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
       LEFT JOIN messages m ON m.created_at >= d.day AND m.created_at < d.day + interval '1 day'
       LEFT JOIN channels c ON c.id = m.channel_id AND c.workspace_id = $1
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
      }
    >(
      `SELECT ${USER_COLUMNS}, u.account_status, u.role_id, u.last_sign_in_at,
              u.two_factor_enabled, u.created_at,
              (SELECT count(*) FROM messages m WHERE m.author_id = u.id) AS message_count
       FROM users u WHERE u.workspace_id = $1 ORDER BY u.display_name
       LIMIT $2`,
      [workspaceId, limit],
    );

    return rows.map((row) => ({
      ...mapUser(row),
      status: row.account_status,
      roleId: row.role_id ?? "role_member",
      lastSignInAt: row.last_sign_in_at?.toISOString() ?? null,
      twoFactorEnabled: row.two_factor_enabled,
      createdAt: row.created_at.toISOString(),
      messageCount: Number(row.message_count),
    }));
  },

  async setUserRole(userId: string, roleId: string): Promise<void> {
    await query(`UPDATE users SET role_id = $2 WHERE id = $1`, [userId, roleId]);
  },

  async setUserStatus(userId: string, status: AdminUser["status"]): Promise<void> {
    await query(`UPDATE users SET account_status = $2 WHERE id = $1`, [userId, status]);
  },

  async listRoles(workspaceId: string): Promise<Role[]> {
    const rows = await query<{
      id: string; name: string; description: string; is_system: boolean;
      member_count: string; permission_ids: string[] | null;
    }>(
      `SELECT r.id, r.name, r.description, r.is_system,
              (SELECT count(*) FROM users u WHERE u.role_id = r.id) AS member_count,
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
