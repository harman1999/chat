import { query, queryOne, transaction } from "../db/client";
import { decryptSecret, encryptSecret, hashSecret } from "../lib/secrets";
import { generateRecoveryCodes, matchingStep, normaliseRecoveryCode } from "../lib/totp";

export type SecondFactor = "code" | "recovery";

export const twoFactorRepo = {
  async isEnabled(userId: string): Promise<boolean> {
    const row = await queryOne<{ x: number }>(`SELECT 1 AS x FROM user_totp WHERE user_id = $1`, [userId]);
    return Boolean(row);
  },

  async recoveryCodesLeft(userId: string): Promise<number> {
    const row = await queryOne<{ n: string }>(
      `SELECT count(*) AS n FROM user_recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    return Number(row?.n ?? 0);
  },

  /** Whether the workspace makes everyone set this up (Admin → Authentication). */
  async isRequired(workspaceId: string): Promise<boolean> {
    const row = await queryOne<{ required: string | null }>(
      `SELECT settings->>'twoFactorRequired' AS required FROM workspaces WHERE id = $1`,
      [workspaceId],
    );
    return row?.required === "true";
  },

  /** The same, for the workspace this person belongs to. */
  async isRequiredForUser(userId: string): Promise<boolean> {
    const row = await queryOne<{ required: string | null }>(
      `SELECT w.settings->>'twoFactorRequired' AS required FROM users u JOIN workspaces w ON w.id = u.workspace_id WHERE u.id = $1`,
      [userId],
    );
    return row?.required === "true";
  },

  /** How many active members have it on, for the admin page. */
  async enrolledCount(workspaceId: string): Promise<{ enrolled: number; total: number }> {
    const row = await queryOne<{ enrolled: string; total: string }>(
      `SELECT count(t.user_id) AS enrolled, count(*) AS total
         FROM users u LEFT JOIN user_totp t ON t.user_id = u.id
        WHERE u.workspace_id = $1 AND u.account_status = 'active' AND NOT u.is_bot`,
      [workspaceId],
    );
    return { enrolled: Number(row?.enrolled ?? 0), total: Number(row?.total ?? 0) };
  },

  /**
   * Turns it on, with a fresh set of recovery codes (returned once; only their
   * hashes are kept). Replaces any earlier setup, so re-enrolling after a lost
   * phone starts clean. `step` is the step of the code just proved, so that very
   * code cannot be used again to sign in.
   */
  async enable(userId: string, secret: string, step: number): Promise<string[]> {
    const codes = generateRecoveryCodes();
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO user_totp (user_id, secret_enc, last_step) VALUES ($1,$2,$3)
         ON CONFLICT (user_id) DO UPDATE SET secret_enc = $2, last_step = $3, created_at = now()`,
        [userId, encryptSecret(secret), step],
      );
      await client.query(`DELETE FROM user_recovery_codes WHERE user_id = $1`, [userId]);
      for (const code of codes) {
        await client.query(`INSERT INTO user_recovery_codes (user_id, code_hash) VALUES ($1,$2)`, [
          userId,
          hashSecret(code),
        ]);
      }
    });
    return codes;
  },

  /** Replaces the recovery codes; the old ones stop working at once. */
  async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = generateRecoveryCodes();
    await transaction(async (client) => {
      await client.query(`DELETE FROM user_recovery_codes WHERE user_id = $1`, [userId]);
      for (const code of codes) {
        await client.query(`INSERT INTO user_recovery_codes (user_id, code_hash) VALUES ($1,$2)`, [
          userId,
          hashSecret(code),
        ]);
      }
    });
    return codes;
  },

  /** Turns it off. The recovery codes go with it (foreign keys do not cover this: they key on the user). */
  async disable(userId: string): Promise<void> {
    await transaction(async (client) => {
      await client.query(`DELETE FROM user_totp WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM user_recovery_codes WHERE user_id = $1`, [userId]);
    });
  },

  /**
   * Checks what the person typed: a code from the app, or a recovery code.
   *
   * A code from the app is accepted once — the step it belongs to must be newer
   * than the last one accepted, and that is claimed in the same statement, so two
   * requests racing with the same code cannot both win. A recovery code is spent
   * the same way. Returns which kind it was, or null.
   */
  async verify(userId: string, input: string): Promise<SecondFactor | null> {
    const text = input.trim();

    const recovery = normaliseRecoveryCode(text);
    if (recovery) {
      const spent = await query<{ code_hash: string }>(
        `UPDATE user_recovery_codes SET used_at = now()
          WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL
         RETURNING code_hash`,
        [userId, hashSecret(recovery)],
      );
      return spent.length > 0 ? "recovery" : null;
    }

    const row = await queryOne<{ secret_enc: string; last_step: string }>(
      `SELECT secret_enc, last_step FROM user_totp WHERE user_id = $1`,
      [userId],
    );
    if (!row) return null;
    const step = matchingStep(decryptSecret(row.secret_enc), text.replace(/\s/g, ""));
    if (step === null || step <= Number(row.last_step)) return null;
    const claimed = await query<{ user_id: string }>(
      `UPDATE user_totp SET last_step = $2 WHERE user_id = $1 AND last_step < $2 RETURNING user_id`,
      [userId, step],
    );
    return claimed.length > 0 ? "code" : null;
  },
};
