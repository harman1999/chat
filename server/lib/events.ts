import { redis, REALTIME_CHANNEL } from "./redis";
import type { RealtimeEnvelope, RealtimeEventName } from "../../src/types";

/**
 * Publishes a realtime event.
 *
 * Every event goes through Redis pub/sub rather than straight to a socket, so
 * any number of WebSocket processes can serve clients and all of them see the
 * event — the API process never needs to know where a user is connected.
 */
export async function publish<T>(
  event: RealtimeEventName,
  payload: T,
  audience: { userIds?: string[]; channelId?: string } = {},
): Promise<void> {
  const envelope: RealtimeEnvelope<T> & { audience: typeof audience } = {
    event,
    seq: await redis.incr("helix:seq"),
    emittedAt: new Date().toISOString(),
    payload,
    audience,
  };

  await redis.publish(REALTIME_CHANNEL, JSON.stringify(envelope));
}
