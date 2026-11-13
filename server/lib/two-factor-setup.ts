import QRCode from "qrcode";
import { queryOne } from "../db/client";
import { verifyPassword } from "./password";
import { redis } from "./redis";
import { decryptSecret, encryptSecret } from "./secrets";
import { generateTotpSecret, otpauthUrl } from "./totp";

export interface SetupDetails {
  /** For typing into an app by hand when the camera is not an option. */
  secret: string;
  /** What the QR code encodes. */
  otpauthUrl: string;
  /** The QR code as an image the page can show directly. */
  qr: string;
}

/**
 * A new secret, ready to show. Nothing is stored here: the caller keeps the secret
 * until a code from it has been proved, so a setup that is abandoned leaves nothing
 * behind and the account is never half set up.
 */
export async function newSetup(userId: string): Promise<{ details: SetupDetails; secret: string }> {
  const who = await queryOne<{ email: string; workspace_name: string }>(
    `SELECT u.email, w.name AS workspace_name FROM users u JOIN workspaces w ON w.id = u.workspace_id WHERE u.id = $1`,
    [userId],
  );
  const secret = generateTotpSecret();
  const url = otpauthUrl({
    secret,
    account: who?.email ?? "account",
    issuer: `${who?.workspace_name ?? "Workspace"} (Helix)`,
  });
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  return { details: { secret, otpauthUrl: url, qr }, secret };
}

/* -------------------------------------------------------------------------- */
/*  Setting up from Settings (already signed in)                              */
/* -------------------------------------------------------------------------- */

const PENDING_SECONDS = 600;
const pendingKey = (userId: string) => `mfa:setup:${userId}`;

/** Held for ten minutes, encrypted, until a code from it is proved or it lapses. */
export async function rememberPendingSecret(userId: string, secret: string): Promise<void> {
  await redis.set(pendingKey(userId), encryptSecret(secret), "EX", PENDING_SECONDS);
}

export async function pendingSecretFor(userId: string): Promise<string | null> {
  const stored = await redis.get(pendingKey(userId));
  return stored ? decryptSecret(stored) : null;
}

export async function forgetPendingSecret(userId: string): Promise<void> {
  await redis.del(pendingKey(userId));
}

/** Changing a security setting asks for the password again, even though the person is signed in. */
export async function passwordIsCorrect(userId: string, password: string): Promise<boolean> {
  const row = await queryOne<{ password_hash: string | null }>(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  return Boolean(row?.password_hash) && (await verifyPassword(password, row!.password_hash as string));
}
