import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time passwords, RFC 6238 over RFC 4226 — what Google
 * Authenticator, 1Password, Authy and every other authenticator app speak.
 * SHA-1, 6 digits, 30-second steps: the only combination all of them support.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Not base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** The six digits for one step. Exported so tests can check the RFC vectors. */
export function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function stepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

/**
 * The step a code was generated for, or null if it matches none near now.
 *
 * One step either side is allowed for clock drift between phone and server — the
 * standard tolerance. Every candidate is compared (not stopping at the first), and
 * in constant time, so the check does not reveal how close a wrong guess was.
 */
export function matchingStep(secretBase32: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return null;
  }
  const current = stepAt(nowMs);
  const given = Buffer.from(code);
  let found: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(given, expected) && found === null) found = step;
  }
  return found;
}

/** The address an authenticator app turns into an entry — also what the QR code encodes. */
export function otpauthUrl(input: { secret: string; account: string; issuer: string }): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* -------------------------------------------------------------------------- */
/*  Recovery codes                                                             */
/* -------------------------------------------------------------------------- */

// No 0/O or 1/I/L, so a code copied by hand is not misread.
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const RECOVERY_CODE_COUNT = 10;

/** `ABCDE-FGHJK` — ten characters, about 49 bits each, from a CSPRNG. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const pick = () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, pick).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** Case, spaces and the dash are forgiven; anything that is not a code is null. */
export function normaliseRecoveryCode(input: string): string | null {
  const squashed = input.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z2-9]{10}$/.test(squashed) || /[ILO01]/.test(squashed)) return null;
  return `${squashed.slice(0, 5)}-${squashed.slice(5)}`;
}
