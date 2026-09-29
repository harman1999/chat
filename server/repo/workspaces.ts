import { randomUUID } from "node:crypto";
import { query, queryOne, transaction } from "../db/client";
import { defaultPreferences } from "../../src/config";
import type { RoleKind, SystemSettings } from "../../src/types";
import { storage } from "../lib/storage";
import { initialsOf } from "../../src/lib/format";

export { MAX_LOGO_BYTES } from "../lib/images";
export { sniffImage as sniffLogo, type ImageMime as LogoMime } from "../lib/images";
import type { ImageMime as LogoMime } from "../lib/images";

/** The URL clients use. Versioned by upload time so a changed logo is refetched. */
export function logoUrlOf(workspaceId: string, updatedAt: Date | null): string | null {
  return updatedAt ? `/api/v1/workspaces/${workspaceId}/logo?v=${updatedAt.getTime()}` : null;
}

const ROLE_KINDS: RoleKind[] = ["owner", "admin", "member", "guest"];

/** Used when the creating workspace somehow lacks one of the built-in roles. */
const ROLE_FALLBACK: Record<RoleKind, { name: string; description: string }> = {
  owner: { name: "Owner", description: "Full control, including billing and workspace deletion." },
  admin: { name: "Administrator", description: "Manages people, channels and configuration." },
  member: { name: "Member", description: "The default role for everyone in the workspace." },
  guest: { name: "Guest", description: "Limited to the channels they are invited to." },
};

/**
 * Settings a new workspace starts with. Stated in full because the System
 * settings page reads every field, and cautious where it matters: no guests,
 * no open invites, no domain restriction until someone sets one.
 */
export function defaultSettings(slug: string, generalChannelId: string | null): Omit<SystemSettings, "workspaceName"> {
  return {
    workspaceUrl: `${slug}.helix.app`,
    defaultChannelIds: generalChannelId ? [generalChannelId] : [],
    allowGuestAccounts: false,
    allowPublicInvites: false,
    restrictSignupDomain: false,
    signupDomains: [],
    messageRetentionDays: null,
    fileRetentionDays: null,
    maxUploadMb: 50,
    sessionTimeoutHours: 720,
  };
}

export function slugFrom(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export const workspacesRepo = {
  /**
   * Creates a separate workspace with an existing person as its owner.
   *
   * There is no screen for this: the workspace is fixed and groups of people
   * inside it are teams. It remains for an operator provisioning another
   * workspace, and for tests that need a second one to prove the two are kept
   * apart. The owner gets a new account there — same email, name and password
   * as the account they are made from, but a distinct row. The
   * built-in roles start as copies of the creator's workspace's, and the owner
   * role always holds every permission. A #general channel is made so the
   * first screen is not empty.
   */
  async create(input: { name: string; creatorId: string }): Promise<{ workspaceId: string; userId: string; slug: string }> {
    return transaction(async (client) => {
      const creator = (
        await client.query<{
          workspace_id: string; username: string; display_name: string; full_name: string; email: string;
          password_hash: string | null; title: string; department: string; timezone: string; avatar_color: number;
        }>(
          `SELECT workspace_id, username, display_name, full_name, email, password_hash, title,
                  department, timezone, avatar_color
             FROM users WHERE id = $1`,
          [input.creatorId],
        )
      ).rows[0];
      if (!creator) throw new Error("Creator not found");

      // Unique slug: "acme", then "acme-2", "acme-3"…
      const base = slugFrom(input.name);
      const taken = new Set(
        (
          await client.query<{ slug: string }>(
            `SELECT slug FROM workspaces WHERE slug = $1 OR slug LIKE $1 || '-%'`,
            [base],
          )
        ).rows.map((row) => row.slug),
      );
      let slug = base;
      for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;

      const workspaceId = `ws_${randomUUID()}`;
      const userId = `u_${randomUUID()}`;
      const generalId = `ch_${randomUUID()}`;

      await client.query(
        `INSERT INTO workspaces (id, name, slug, initials, settings) VALUES ($1,$2,$3,$4,$5)`,
        [workspaceId, input.name, slug, initialsOf(input.name), JSON.stringify(defaultSettings(slug, generalId))],
      );

      const roleIds = {} as Record<RoleKind, string>;
      for (const kind of ROLE_KINDS) {
        const source = (
          await client.query<{ id: string; name: string; description: string }>(
            `SELECT id, name, description FROM roles WHERE workspace_id = $1 AND kind = $2`,
            [creator.workspace_id, kind],
          )
        ).rows[0];
        const roleId = `role_${randomUUID()}`;
        roleIds[kind] = roleId;
        const { name, description } = source ?? ROLE_FALLBACK[kind];
        await client.query(
          `INSERT INTO roles (id, workspace_id, name, description, is_system, kind) VALUES ($1,$2,$3,$4,true,$5)`,
          [roleId, workspaceId, name, description, kind],
        );
        if (kind === "owner") {
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions`,
            [roleId],
          );
        } else if (source) {
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id)
             SELECT $1, permission_id FROM role_permissions WHERE role_id = $2`,
            [roleId, source.id],
          );
        }
      }

      await client.query(
        `INSERT INTO users (id, workspace_id, username, display_name, full_name, email, password_hash,
                            title, department, timezone, avatar_color, role, role_id, account_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'owner',$12,'active')`,
        [
          userId, workspaceId, creator.username, creator.display_name, creator.full_name, creator.email,
          creator.password_hash, creator.title, creator.department, creator.timezone, creator.avatar_color,
          roleIds.owner,
        ],
      );
      await client.query(`INSERT INTO user_preferences (user_id, preferences) VALUES ($1,$2)`, [
        userId,
        JSON.stringify(defaultPreferences),
      ]);

      await client.query(
        `INSERT INTO channels (id, workspace_id, kind, name, purpose, created_by)
         VALUES ($1,$2,'public','general',$3,$4)`,
        [generalId, workspaceId, "Company-wide announcements and discussions", userId],
      );
      // member_count follows from the trigger (migration 0003).
      await client.query(`INSERT INTO channel_members (channel_id, user_id) VALUES ($1,$2)`, [generalId, userId]);

      return { workspaceId, userId, slug };
    });
  },

  /** Renames the workspace. Initials follow the name, since the switcher shows them. */
  async rename(workspaceId: string, name: string): Promise<void> {
    await query(`UPDATE workspaces SET name = $2, initials = $3 WHERE id = $1`, [
      workspaceId,
      name,
      initialsOf(name),
    ]);
  },

  /** For the sign-in page, which may be told which workspace to sign in to. */
  async bySlug(slug: string): Promise<{ slug: string; name: string } | null> {
    return queryOne<{ slug: string; name: string }>(`SELECT slug, name FROM workspaces WHERE slug = $1`, [slug]);
  },

  async name(workspaceId: string): Promise<string | null> {
    return (await workspacesRepo.identity(workspaceId))?.name ?? null;
  },

  /** What a page header needs to show the workspace. */
  async identity(workspaceId: string): Promise<{ name: string; slug: string; logoUrl: string | null } | null> {
    const row = await queryOne<{ name: string; slug: string; logo_updated_at: Date | null }>(
      `SELECT name, slug, logo_updated_at FROM workspaces WHERE id = $1`,
      [workspaceId],
    );
    return row
      ? { name: row.name, slug: row.slug, logoUrl: logoUrlOf(workspaceId, row.logo_updated_at) }
      : null;
  },

  async logo(workspaceId: string): Promise<{ key: string; mime: LogoMime } | null> {
    const row = await queryOne<{ logo_key: string | null; logo_mime: LogoMime | null }>(
      `SELECT logo_key, logo_mime FROM workspaces WHERE id = $1`,
      [workspaceId],
    );
    return row?.logo_key && row.logo_mime ? { key: row.logo_key, mime: row.logo_mime } : null;
  },

  /**
   * Stores a new logo and points the workspace at it. The new file is written
   * before the row changes, and the old one removed only after, so a failure
   * part-way never leaves the workspace pointing at nothing.
   */
  async setLogo(workspaceId: string, data: Buffer, mime: LogoMime): Promise<string | null> {
    const previous = await workspacesRepo.logo(workspaceId);
    const key = `workspace-logos/${workspaceId}/${randomUUID()}`;
    await storage.put(key, data);
    const row = await queryOne<{ logo_updated_at: Date }>(
      `UPDATE workspaces SET logo_key = $2, logo_mime = $3, logo_updated_at = now()
        WHERE id = $1 RETURNING logo_updated_at`,
      [workspaceId, key, mime],
    );
    if (previous) await storage.remove(previous.key);
    return logoUrlOf(workspaceId, row?.logo_updated_at ?? null);
  },

  async clearLogo(workspaceId: string): Promise<boolean> {
    const previous = await workspacesRepo.logo(workspaceId);
    if (!previous) return false;
    await query(
      `UPDATE workspaces SET logo_key = NULL, logo_mime = NULL, logo_updated_at = NULL WHERE id = $1`,
      [workspaceId],
    );
    await storage.remove(previous.key);
    return true;
  },
};
