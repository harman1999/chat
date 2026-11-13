import { randomBytes } from "node:crypto";
import { redis } from "./redis";
import { decryptSecret, encryptSecret, hashSecret } from "./secrets";

/**
 * The state between "password accepted" and "second factor accepted".
 *
 * No session exists yet, so the browser holds this instead: a random token whose
 * hash is the Redis key (a list of keys must not spell out usable tokens). It
 * works for five minutes, for five wrong codes, and only once.
 *
 * `verify` asks for a code the person already has set up; `enrol` is for a
 * workspace that requires two-factor from someone who has not set it up yet — the
 * secret they are in the middle of adding waits here, encrypted, until a code
 * from it is proved.
 */
const TTL_SECONDS = 300;
export const MAX_CHALLENGE_ATTEMPTS = 5;

export interface Challenge {
  userId: string;
  mode: "verify" | "enrol";
  /** The "remember me" choice made with the password, carried to the end of the sign-in. */
  remember: boolean;
  /** Only while enrolling, and only after the secret has been shown. */
  pendingSecret?: string;
}

const keyOf = (token: string) => `mfa:challenge:${hashSecret(token)}`;
const attemptsKeyOf = (token: string) => `mfa:attempts:${hashSecret(token)}`;

export async function createChallenge(userId: string, mode: Challenge["mode"], remember = true): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await redis.set(keyOf(token), JSON.stringify({ userId, mode, remember } satisfies Challenge), "EX", TTL_SECONDS);
  return token;
}

export async function readChallenge(token: string): Promise<Challenge | null> {
  if (!token || token.length > 100) return null;
  const raw = await redis.get(keyOf(token));
  if (!raw) return null;
  const stored = JSON.parse(raw) as Challenge;
  return { ...stored, pendingSecret: stored.pendingSecret ? decryptSecret(stored.pendingSecret) : undefined };
}

export async function setPendingSecret(token: string, secret: string): Promise<void> {
  const raw = await redis.get(keyOf(token));
  if (!raw) return;
  const stored = JSON.parse(raw) as Challenge;
  const ttl = await redis.ttl(keyOf(token));
  await redis.set(
    keyOf(token),
    JSON.stringify({ ...stored, pendingSecret: encryptSecret(secret) }),
    "EX",
    ttl > 0 ? ttl : TTL_SECONDS,
  );
}

/** Counts a wrong code; the fifth ends the challenge, so the password has to be entered again. */
export async function failChallenge(token: string): Promise<void> {
  const attempts = await redis.incr(attemptsKeyOf(token));
  if (attempts === 1) await redis.expire(attemptsKeyOf(token), TTL_SECONDS);
  if (attempts >= MAX_CHALLENGE_ATTEMPTS) await endChallenge(token);
}

export async function endChallenge(token: string): Promise<void> {
  await redis.del(keyOf(token), attemptsKeyOf(token));
}
