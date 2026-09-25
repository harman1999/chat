import Redis from "ioredis";
import { env } from "../env";

/**
 * Redis carries three things: session lookups, presence (which expires on its
 * own), and the pub/sub channel that fans realtime events out across every
 * WebSocket process.
 */
const globalForRedis = globalThis as unknown as { helixRedis?: Redis };

export const redis =
  globalForRedis.helixRedis ??
  new Redis(env.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false });

if (process.env.NODE_ENV !== "production") globalForRedis.helixRedis = redis;

export const REALTIME_CHANNEL = "helix:events";

/** A separate connection: a subscriber cannot issue normal commands. */
export function createSubscriber(): Redis {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: 3 });
}

export const presenceKey = (userId: string) => `presence:${userId}`;
export const sessionKey = (sessionId: string) => `session:${sessionId}`;
