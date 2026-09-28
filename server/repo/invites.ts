import { randomUUID } from "node:crypto";
import { query, queryOne } from "../db/client";
import { generateSecret, hashSecret } from "../lib/secrets";
import { usernameFrom, usersRepo, type CreateUserResult } from "./users";
import type { InviteLink, InvitePreview } from "../../src/types";

/** A link always grants the least-privileged role; see migration 0006. */
const INVITED_ROLE = "role_member";
/** Where a new member lands, so their first screen is not an empty sidebar. */
const DEFAULT_CHANNELS = ["general"];

interface LinkRow {
  id: string;
  token_prefix: string;
  created_at: Date;
  expires_at: Date;
  max_uses: number | null;
  use_count: number;
  revoked_at: Date | null;
  creator_name: string;
}

function mapLink(row: LinkRow): InviteLink {
  return {
    id: row.id,
    tokenPrefix: row.token_prefix,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    maxUses: row.max_uses,
    useCount: row.use_count,
    createdByName: row.creator_name,
  };
}

/** Why a link cannot be used. Each has a different fix for the person holding it. */
export type InviteProblem = "not_found" | "expired" | "revoked" | "used_up";

export const invitesRepo = {
  /**
   * Creates a link and returns its token in plaintext exactly once. Only the
   * hash is stored, so a lost link is replaced, not recovered.
   */
  async create(input: {
    workspaceId: string;
    createdBy: string;
    expiresInDays: number;
    maxUses: number | null;
  }): Promise<{ link: InviteLink; token: string }> {
    const id = `inv_${randomUUID()}`;
    const secret = generateSecret("inv");
    await query(
      `INSERT INTO invite_links (id, workspace_id, token_hash, token_prefix, created_by, expires_at, max_uses)
       VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval, $7)`,
      [id, input.workspaceId, secret.hash, secret.prefix, input.createdBy, input.expiresInDays, input.maxUses],
    );
    const links = await invitesRepo.listActive(input.workspaceId);
    return { link: links.find((link) => link.id === id) as InviteLink, token: secret.plaintext };
  },

  /** Links that can still be used — not revoked, not expired, not used up. */
  async listActive(workspaceId: string): Promise<InviteLink[]> {
    const rows = await query<LinkRow>(
      `SELECT l.id, l.token_prefix, l.created_at, l.expires_at, l.max_uses, l.use_count,
              l.revoked_at, u.display_name AS creator_name
         FROM invite_links l JOIN users u ON u.id = l.created_by
        WHERE l.workspace_id = $1 AND l.revoked_at IS NULL AND l.expires_at > now()
          AND (l.max_uses IS NULL OR l.use_count < l.max_uses)
        ORDER BY l.created_at DESC
        LIMIT 100`,
      [workspaceId],
    );
    return rows.map(mapLink);
  },

  async revoke(id: string, workspaceId: string): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `UPDATE invite_links SET revoked_at = now()
        WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL RETURNING id`,
      [id, workspaceId],
    );
    return rows.length > 0;
  },

  /**
   * What the join page shows before anyone signs up. Says *why* a link is
   * unusable — expired, revoked, used up — because each needs a different fix,
   * and the token is too long to guess, so naming the reason leaks nothing.
   */
  async preview(token: string): Promise<{ ok: true; preview: InvitePreview } | { ok: false; reason: InviteProblem }> {
    const row = await queryOne<{
      expires_at: Date; max_uses: number | null; use_count: number; revoked_at: Date | null;
      workspace_name: string; inviter_name: string;
    }>(
      `SELECT l.expires_at, l.max_uses, l.use_count, l.revoked_at,
              w.name AS workspace_name, u.display_name AS inviter_name
         FROM invite_links l
         JOIN workspaces w ON w.id = l.workspace_id
         JOIN users u ON u.id = l.created_by
        WHERE l.token_hash = $1`,
      [hashSecret(token)],
    );
    if (!row) return { ok: false, reason: "not_found" };
    if (row.revoked_at) return { ok: false, reason: "revoked" };
    if (row.expires_at.getTime() <= Date.now()) return { ok: false, reason: "expired" };
    if (row.max_uses !== null && row.use_count >= row.max_uses) return { ok: false, reason: "used_up" };

    return {
      ok: true,
      preview: {
        workspaceName: row.workspace_name,
        invitedByName: row.inviter_name,
        expiresAt: row.expires_at.toISOString(),
      },
    };
  },

  /**
   * Joins the workspace through a link.
   *
   * A use is claimed with a single conditional UPDATE, so two people accepting
   * a one-use link at the same moment cannot both get in: only one UPDATE finds
   * `use_count < max_uses` still true. If creating the account then fails — a
   * taken address, say — the use is handed back, so a failed attempt does not
   * burn a place on a limited link.
   */
  async accept(input: {
    token: string;
    fullName: string;
    email: string;
    password: string;
  }): Promise<
    | { ok: true; userId: string; workspaceId: string }
    | { ok: false; reason: InviteProblem }
    | { ok: false; reason: "account"; result: Exclude<CreateUserResult, { ok: true }> }
  > {
    const claimed = await queryOne<{ id: string; workspace_id: string }>(
      `UPDATE invite_links SET use_count = use_count + 1
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
          AND (max_uses IS NULL OR use_count < max_uses)
      RETURNING id, workspace_id`,
      [hashSecret(input.token)],
    );

    if (!claimed) {
      // Work out which reason applies, for the person holding the link.
      const why = await invitesRepo.preview(input.token);
      return { ok: false, reason: why.ok ? "used_up" : why.reason };
    }

    // The join form does not ask for a username, so one has to be found. Two
    // people called Ada Lovelace joining must both succeed — the second as
    // ada.lovelace2 — rather than the second being refused with no way to
    // choose another. Tried in order, since creating also re-checks for a clash
    // and so stays correct if two people with the same name join at once.
    const base = usernameFrom(input.fullName) || "member";
    let created: CreateUserResult | undefined;
    for (let attempt = 1; attempt <= 25; attempt += 1) {
      created = await usersRepo.create({
        workspaceId: claimed.workspace_id,
        email: input.email,
        fullName: input.fullName,
        password: input.password,
        username: attempt === 1 ? base : `${base}${attempt}`,
        roleId: INVITED_ROLE,
        channels: DEFAULT_CHANNELS,
      });
      if (created.ok || created.reason !== "username_taken") break;
    }
    created = created as CreateUserResult;

    if (!created.ok) {
      await query(`UPDATE invite_links SET use_count = use_count - 1 WHERE id = $1`, [claimed.id]);
      return { ok: false, reason: "account", result: created };
    }

    return { ok: true, userId: created.user.id, workspaceId: claimed.workspace_id };
  },
};
