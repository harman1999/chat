import { randomUUID } from "node:crypto";
import { query, queryOne, transaction } from "../db/client";
import { hashPassword } from "../lib/password";
import { defaultPreferences } from "../../src/config";
import type { PresenceStatus, User, UserPreferences, UserSession } from "../../src/types";

export const USER_COLUMNS = `
  u.id, u.username, u.display_name, u.full_name, u.email, u.title, u.department,
  u.timezone, u.avatar_url, u.avatar_color, u.presence, u.status_emoji, u.status_text,
  u.status_expires_at, u.role, u.is_bot, u.last_active_at
`;

export interface UserRow {
  id: string;
  username: string;
  display_name: string;
  full_name: string;
  email: string;
  title: string;
  department: string;
  timezone: string;
  avatar_url: string | null;
  avatar_color: number;
  presence: PresenceStatus;
  status_emoji: string | null;
  status_text: string | null;
  status_expires_at: Date | null;
  role: User["role"];
  is_bot: boolean;
  last_active_at: Date;
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    fullName: row.full_name,
    email: row.email,
    title: row.title,
    department: row.department,
    timezone: row.timezone,
    avatarUrl: row.avatar_url,
    avatarColor: row.avatar_color,
    presence: row.presence,
    customStatus:
      row.status_text
        ? {
            emoji: row.status_emoji ?? "💬",
            text: row.status_text,
            expiresAt: row.status_expires_at?.toISOString() ?? null,
          }
        : null,
    role: row.role,
    isBot: row.is_bot,
    lastActiveAt: row.last_active_at.toISOString(),
  };
}

export interface CreateUserInput {
  workspaceId: string;
  email: string;
  fullName: string;
  password: string;
  username?: string;
  roleId?: string;
  title?: string;
  department?: string;
  timezone?: string;
  /** Public channels to join, by name. */
  channels?: string[];
}

/** Why a create was refused, so the caller can say which field to fix. */
export type CreateUserFailure =
  | { reason: "email_taken" }
  | { reason: "username_taken"; username: string }
  | { reason: "unknown_role"; roleId: string }
  | { reason: "unknown_channels"; names: string[] };

export type CreateUserResult =
  | { ok: true; user: User; channels: { id: string; name: string }[] }
  | ({ ok: false } & CreateUserFailure);

/** "Ada Lovelace" -> "ada.lovelace", the convention the seed uses. */
export function usernameFrom(fullName: string): string {
  return fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

/** Derived so two people rarely land on the same avatar colour. */
function avatarColor(seed: string, buckets = 8): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % buckets;
}

export const usersRepo = {
  /**
   * The workspace directory. Capped rather than paged: the client builds a
   * lookup map from it, so a partial page would silently render "Unknown" for
   * whoever fell off the end. Past this size the directory needs a different
   * shape — search-on-demand rather than a full list.
   */
  async list(workspaceId: string, limit = 1_000): Promise<User[]> {
    const rows = await query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users u
       WHERE u.workspace_id = $1 AND u.account_status <> 'deactivated'
       ORDER BY u.display_name
       LIMIT $2`,
      [workspaceId, limit],
    );
    return rows.map(mapUser);
  },

  /**
   * Creates an account outright.
   *
   * Every refusal is a typed result rather than a thrown error, because each
   * one names a different field for the caller to correct — an HTTP layer that
   * could only say "409" would not know which.
   */
  async create(input: CreateUserInput): Promise<CreateUserResult> {
    const username = input.username?.trim() || usernameFrom(input.fullName);
    const email = input.email.trim().toLowerCase();
    const roleId = input.roleId ?? "role_member";

    // users.role_id carries no foreign key, so an unknown id would be written
    // silently and only surface later as a broken permission check.
    const role = await queryOne<{ id: string }>(
      `SELECT id FROM roles WHERE id = $1 AND workspace_id = $2`,
      [roleId, input.workspaceId],
    );
    if (!role) return { ok: false, reason: "unknown_role", roleId };

    const clash = await queryOne<{ email: string }>(
      `SELECT email FROM users WHERE workspace_id = $1 AND (email = $2 OR username = $3)`,
      [input.workspaceId, email, username],
    );
    if (clash) {
      return clash.email === email
        ? { ok: false, reason: "email_taken" }
        : { ok: false, reason: "username_taken", username };
    }

    const wanted = input.channels ?? [];
    const channels = wanted.length
      ? await query<{ id: string; name: string }>(
          `SELECT id, name FROM channels
           WHERE workspace_id = $1 AND kind = 'public' AND name = ANY($2::text[])`,
          [input.workspaceId, wanted],
        )
      : [];
    const missing = wanted.filter((name) => !channels.some((channel) => channel.name === name));
    if (missing.length) return { ok: false, reason: "unknown_channels", names: missing };

    const id = `u_${randomUUID()}`;
    const passwordHash = await hashPassword(input.password);

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO users (
           id, workspace_id, username, display_name, full_name, email, password_hash,
           title, department, timezone, avatar_color, role, role_id, account_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active')`,
        [
          id,
          input.workspaceId,
          username,
          input.fullName,
          input.fullName,
          email,
          passwordHash,
          input.title ?? "",
          input.department ?? "",
          input.timezone || "UTC",
          avatarColor(id),
          // `role` is the legacy display column; `role_id` is what permissions read.
          roleId.replace(/^role_/, ""),
          roleId,
        ],
      );

      await client.query(`INSERT INTO user_preferences (user_id, preferences) VALUES ($1,$2)`, [
        id,
        JSON.stringify(defaultPreferences),
      ]);

      for (const channel of channels) {
        // channels.member_count follows from a trigger (migration 0003).
        await client.query(
          `INSERT INTO channel_members (channel_id, user_id, last_read_at)
           VALUES ($1,$2,now()) ON CONFLICT DO NOTHING`,
          [channel.id, id],
        );
      }
    });

    const user = await usersRepo.get(id);
    // The row was just written in a committed transaction, so this cannot miss.
    return { ok: true, user: user as User, channels };
  },

  async get(id: string): Promise<User | null> {
    const row = await queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [id]);
    return row ? mapUser(row) : null;
  },

  async findByEmail(workspaceId: string, email: string) {
    return queryOne<UserRow & { password_hash: string | null; account_status: string }>(
      `SELECT ${USER_COLUMNS}, u.password_hash, u.account_status
       FROM users u WHERE u.workspace_id = $1 AND lower(u.email) = lower($2)`,
      [workspaceId, email],
    );
  },

  async setPresence(userId: string, presence: PresenceStatus): Promise<void> {
    await query(`UPDATE users SET presence = $2, last_active_at = now() WHERE id = $1`, [
      userId,
      presence,
    ]);
  },

  async setCustomStatus(
    userId: string,
    status: { emoji: string; text: string; expiresAt: string | null } | null,
  ): Promise<void> {
    await query(
      `UPDATE users SET status_emoji = $2, status_text = $3, status_expires_at = $4 WHERE id = $1`,
      [userId, status?.emoji ?? null, status?.text ?? null, status?.expiresAt ?? null],
    );
  },

  async updateProfile(
    userId: string,
    input: { displayName: string; fullName: string; title: string; department: string; timezone: string },
  ): Promise<void> {
    await query(
      `UPDATE users SET display_name = $2, full_name = $3, title = $4, department = $5, timezone = $6
       WHERE id = $1`,
      [userId, input.displayName, input.fullName, input.title, input.department, input.timezone],
    );
  },

  async getPreferences(userId: string): Promise<UserPreferences | null> {
    const row = await queryOne<{ preferences: UserPreferences }>(
      `SELECT preferences FROM user_preferences WHERE user_id = $1`,
      [userId],
    );
    return row?.preferences ?? null;
  },

  async mergePreferences(userId: string, patch: Partial<UserPreferences>): Promise<void> {
    // jsonb || jsonb merges at the top level, which matches the client's
    // partial-update contract (it always sends whole sub-objects).
    await query(
      `INSERT INTO user_preferences (user_id, preferences, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE
         SET preferences = user_preferences.preferences || EXCLUDED.preferences,
             updated_at = now()`,
      [userId, JSON.stringify(patch)],
    );
  },

  async listSessions(userId: string, currentSessionId: string): Promise<UserSession[]> {
    const rows = await query<{
      id: string;
      device_kind: UserSession["deviceKind"];
      device_label: string;
      browser: string;
      location: string;
      ip_address: string | null;
      last_active_at: Date;
      created_at: Date;
    }>(
      `SELECT id, device_kind, device_label, browser, location, ip_address::text,
              last_active_at, created_at
       FROM sessions WHERE user_id = $1 AND expires_at > now()
       ORDER BY last_active_at DESC
       LIMIT 50`,
      [userId],
    );

    return rows.map((row) => ({
      id: row.id,
      deviceKind: row.device_kind,
      deviceLabel: row.device_label,
      browser: row.browser,
      location: row.location || "Unknown location",
      ipAddress: row.ip_address ?? "—",
      lastActiveAt: row.last_active_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      isCurrent: row.id === currentSessionId,
    }));
  },
};
