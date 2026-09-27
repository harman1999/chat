import Redis from "ioredis";
import { env } from "../env";

/**
 * Redis carries three things: session lookups, presence (which expires on its
 * own), and the pub/sub channel that fans realtime events out across every
 * WebSocket process.
 */
const globalForRedis = globalThis as unknown as { helixRedis?: Redis };

/**
 * Connected on first use, not on import.
 *
 * `next build` imports every route module to collect metadata, with none of the
 * runtime environment present. A client constructed at module scope turned that
 * into a build failure — and, worse, opened a connection during the build. The
 * proxy keeps the ergonomics of a plain client while deferring both.
 */
function connect(): Redis {
  if (globalForRedis.helixRedis) return globalForRedis.helixRedis;
  const client = new Redis(env.redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false });
  if (process.env.NODE_ENV !== "production") globalForRedis.helixRedis = client;
  return client;
}

let client: Redis | undefined;

export const redis = new Proxy({} as Redis, {
  get(_target, property, receiver) {
    client ??= connect();
    const value = Reflect.get(client, property, receiver);
    // Methods must stay bound to the real client, not to the proxy.
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const REALTIME_CHANNEL = "helix:events";

/** A separate connection: a subscriber cannot issue normal commands. */
export function createSubscriber(): Redis {
  return new Redis(env.redisUrl, { maxRetriesPerRequest: 3 });
}

export const presenceKey = (userId: string) => `presence:${userId}`;
export const sessionKey = (sessionId: string) => `session:${sessionId}`;
