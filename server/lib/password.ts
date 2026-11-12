import { randomInt } from "node:crypto";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { BusyError } from "./busy";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const KEY_LENGTH = 64;

type Params = { N: number; r: number; p: number };

/**
 * The cost of a new hash: scrypt N=2^16, r=8, p=2 — one of the combinations the
 * OWASP Password Storage Cheat Sheet lists (64 MiB, about 0.3 s). Node's own
 * default is N=2^14 (16 MiB, about 0.04 s), which is several times cheaper for
 * someone who has stolen the hashes to guess against.
 */
const CURRENT: Params = { N: 2 ** 16, r: 8, p: 2 };
/** What hashes written before the parameters were stored were made with (Node's defaults). */
const LEGACY: Params = { N: 2 ** 14, r: 8, p: 1 };
const MAX_MEMORY = 256 * 1024 * 1024;

/**
 * At most this many hashes run at once, and a few more may wait; beyond that the
 * caller is told the server is busy.
 *
 * scrypt runs on Node's small worker-thread pool (4 threads), which also does
 * hostname lookups — what the database and Redis drivers use to open a connection.
 * A flood of sign-ins used to occupy every thread for seconds, so the app could
 * not reach its own database and answered 500. Staying under the pool size keeps a
 * thread free, bounds memory (64 MiB per hash), and fails fast instead of queueing.
 */
const MAX_CONCURRENT_HASHES = 3;
const MAX_WAITING_HASHES = 24;
let running = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT_HASHES) {
    running++;
    return;
  }
  if (waiting.length >= MAX_WAITING_HASHES) throw new BusyError();
  // The slot is handed over by release(), so `running` is unchanged.
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

async function derive(password: string, salt: Buffer, params: Params): Promise<Buffer> {
  await acquire();
  try {
    return await scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: MAX_MEMORY });
  } finally {
    release();
  }
}

/**
 * scrypt from the standard library — no third-party hashing dependency.
 *
 * The stored form is `scrypt$N$r$p$salt$hash`, so each hash says how it was made
 * and the cost can be raised later without breaking existing passwords: the old
 * ones keep verifying with their own parameters and are replaced at next sign-in.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(password, salt, CURRENT);
  return `scrypt$${CURRENT.N}$${CURRENT.r}$${CURRENT.p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** `scrypt$N$r$p$salt$hash`, or the older `scrypt$salt$hash` made with Node's defaults. */
function parse(stored: string): { params: Params; saltHex: string; hashHex: string } | null {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt") return null;
  if (parts.length === 3) return { params: LEGACY, saltHex: parts[1], hashHex: parts[2] };
  if (parts.length !== 6) return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  // A stored hash is trusted data, but absurd costs are refused rather than allocated.
  if (![N, r, p].every(Number.isInteger) || N < 2 ** 10 || N > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) {
    return null;
  }
  return { params: { N, r, p }, saltHex: parts[4], hashHex: parts[5] };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed || !parsed.saltHex || !parsed.hashHex) return false;

  const derived = await derive(password, Buffer.from(parsed.saltHex, "hex"), parsed.params);
  const expected = Buffer.from(parsed.hashHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Whether this hash was made more cheaply than new ones are, and should be redone at next sign-in. */
export function passwordNeedsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return !!parsed && (parsed.params.N < CURRENT.N || parsed.params.r < CURRENT.r || parsed.params.p < CURRENT.p);
}

/**
 * A random password for an administrator to hand to someone, 16 characters
 * (about 93 bits). Left out: characters that look alike (0/O, 1/l/I), because
 * it is read aloud or retyped, not pasted from an email.
 */
export function generateTemporaryPassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 16 }, () => alphabet[randomInt(alphabet.length)]).join("");
}
