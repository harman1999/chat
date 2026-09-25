import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { env } from "../env";

/**
 * Credentials for integrations.
 *
 * Deliberately separate from `password.ts`. A password is low-entropy and needs
 * a slow hash; these are 256-bit random values, where a slow hash buys nothing
 * against guessing and costs a scrypt on the authentication path of every bot
 * request. SHA-256 over a full-entropy secret is the right tool.
 */

const TOKEN_BYTES = 32;

export interface GeneratedSecret {
  /** Returned to the caller once and never stored. */
  plaintext: string;
  hash: string;
  /** Enough to recognise the credential in a list, not enough to use it. */
  prefix: string;
}

/** `hlx_<kind>_<43 url-safe chars>` — the kind makes a leaked token greppable. */
export function generateSecret(kind: string): GeneratedSecret {
  const plaintext = `hlx_${kind}_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  return { plaintext, hash: hashSecret(plaintext), prefix: plaintext.slice(0, 12) };
}

export function hashSecret(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Compares in constant time.
 *
 * Both sides are hex of the same length, so this cannot leak length; the
 * comparison itself must not leak position either, which `===` on a string
 * would.
 */
export function secretMatches(plaintext: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashSecret(plaintext), "hex");
  const expected = Buffer.from(storedHash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/* -------------------------------------------------------------------------- */
/*  Reversible encryption                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Only outgoing OAuth needs this: to authenticate *to* another service we have
 * to be able to read the secret back, so it cannot be hashed. Everything else
 * in this file is one-way because everything else is only ever compared.
 */
function encryptionKey(): Buffer {
  // Derived from the configured secret so the stored ciphertext does not depend
  // on the raw value's length or encoding.
  return scryptSync(env.encryptionSecret, "helix-integration-secrets", 32);
}

/** AES-256-GCM. Format: v1.<iv>.<authTag>.<ciphertext>, all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(stored: string): string {
  const [version, ivPart, tagPart, dataPart] = stored.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !dataPart) {
    throw new Error("Unrecognised ciphertext format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  // GCM authenticates as well as encrypts: a tampered ciphertext throws here
  // rather than decrypting to something attacker-chosen.
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/* -------------------------------------------------------------------------- */
/*  Delivery signatures                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Signs an outgoing delivery so the receiver can tell it came from here.
 *
 * The timestamp is inside the signed material, not merely alongside it —
 * otherwise a captured delivery can be replayed forever with its own headers
 * intact.
 */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex");
}
