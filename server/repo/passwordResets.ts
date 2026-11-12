import { query, transaction } from "../db/client";

/** How long an emailed reset link stays valid. */
export const RESET_LINK_MINUTES = 60;

export const passwordResetsRepo = {
  /**
   * Stores a new link's hash. Any earlier link for the same person is removed,
   * so only the most recent email works; expired rows are swept as a side effect.
   */
  async create(userId: string, tokenHash: string): Promise<void> {
    await transaction(async (client) => {
      await client.query(
        `DELETE FROM password_reset_tokens WHERE user_id = $1 OR expires_at < now() - interval '1 day'`,
        [userId],
      );
      await client.query(
        `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + make_interval(mins => $3))`,
        [tokenHash, userId, RESET_LINK_MINUTES],
      );
    });
  },

  /**
   * Spends a link and sets the password in one transaction, so a link cannot
   * be used twice and a failed update does not burn it. Null when the link is
   * unknown, used, expired, or belongs to a deactivated account.
   */
  async redeem(
    tokenHash: string,
    passwordHash: string,
  ): Promise<{ userId: string; email: string; name: string; workspaceName: string } | null> {
    return transaction(async (client) => {
      const spent = await client.query<{ user_id: string }>(
        `UPDATE password_reset_tokens t SET used_at = now()
          WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()
            AND EXISTS (SELECT 1 FROM users u WHERE u.id = t.user_id AND u.account_status <> 'deactivated')
        RETURNING t.user_id`,
        [tokenHash],
      );
      const userId = spent.rows[0]?.user_id;
      if (!userId) return null;

      const updated = await client.query<{ email: string; display_name: string; workspace_name: string }>(
        `UPDATE users u SET password_hash = $2
           FROM workspaces w
          WHERE u.id = $1 AND w.id = u.workspace_id
        RETURNING u.email, u.display_name, w.name AS workspace_name`,
        [userId, passwordHash],
      );
      const row = updated.rows[0];
      if (!row) return null;
      return { userId, email: row.email, name: row.display_name, workspaceName: row.workspace_name };
    });
  },

  /** For tests and diagnostics: how many links a person has outstanding. */
  async countFor(userId: string): Promise<number> {
    const rows = await query<{ n: string }>(
      `SELECT count(*) AS n FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()`,
      [userId],
    );
    return Number(rows[0]?.n ?? 0);
  },
};
