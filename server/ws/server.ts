/**
 * WebSocket gateway.
 *
 * Runs as its own process because Next.js route handlers cannot take over an
 * HTTP upgrade. It owns no business logic: the API writes to Postgres and
 * publishes to Redis, and this process only decides which sockets should see
 * each event.
 */
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { env } from "../env";
import { query, queryOne } from "../db/client";
import { createSubscriber, presenceKey, redis, REALTIME_CHANNEL, sessionKey } from "../lib/redis";

interface Client {
  socket: WebSocket;
  userId: string;
  /** Channels the user belongs to, cached for the life of the connection. */
  channelIds: Set<string>;
  isAlive: boolean;
}

const clients = new Set<Client>();

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [name, ...rest] = part.trim().split("=");
      return [name, decodeURIComponent(rest.join("="))];
    }),
  );
}

async function authenticate(cookieHeader: string | undefined, token: string | null) {
  const sessionId = parseCookies(cookieHeader)[env.sessionCookie] ?? token;
  if (!sessionId) return null;

  let userId = await redis.get(sessionKey(sessionId));
  if (!userId) {
    const row = await queryOne<{ user_id: string }>(
      `SELECT user_id FROM sessions WHERE id = $1 AND expires_at > now()`,
      [sessionId],
    );
    if (!row) return null;
    userId = row.user_id;
  }
  return userId;
}

async function channelsFor(userId: string): Promise<Set<string>> {
  const rows = await query<{ channel_id: string }>(
    `SELECT channel_id FROM channel_members WHERE user_id = $1`,
    [userId],
  );
  return new Set(rows.map((row) => row.channel_id));
}

/** An event reaches a client if it is addressed to them, or to a channel they are in. */
function shouldDeliver(client: Client, audience: { userIds?: string[]; channelId?: string }): boolean {
  if (!audience.userIds && !audience.channelId) return true;
  if (audience.userIds?.includes(client.userId)) return true;
  if (audience.channelId && client.channelIds.has(audience.channelId)) return true;
  return false;
}

async function main() {
  const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, clients: clients.size }));
      return;
    }
    response.writeHead(426);
    response.end("Upgrade required");
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", async (socket, request) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const userId = await authenticate(request.headers.cookie, url.searchParams.get("token"));

    if (!userId) {
      socket.close(4001, "Unauthorized");
      return;
    }

    const client: Client = {
      socket,
      userId,
      channelIds: await channelsFor(userId),
      isAlive: true,
    };
    clients.add(client);

    await redis.set(presenceKey(userId), "online", "EX", 120);
    await query(`UPDATE users SET presence = 'online', last_active_at = now() WHERE id = $1`, [userId]);
    await redis.publish(
      REALTIME_CHANNEL,
      JSON.stringify({
        event: "user.online",
        seq: await redis.incr("helix:seq"),
        emittedAt: new Date().toISOString(),
        payload: { userId, status: "online" },
        audience: {},
      }),
    );

    socket.on("pong", () => {
      client.isAlive = true;
    });

    socket.on("message", async (raw) => {
      try {
        const frame = JSON.parse(raw.toString()) as { event: string; payload: unknown };
        // Typing is the only client-originated event, and it is relayed rather
        // than stored — the sender is taken from the session, never the frame.
        if (frame.event === "typing.started" || frame.event === "typing.stopped") {
          const payload = frame.payload as { channelId?: string };
          if (!payload?.channelId || !client.channelIds.has(payload.channelId)) return;

          await redis.publish(
            REALTIME_CHANNEL,
            JSON.stringify({
              event: frame.event,
              seq: await redis.incr("helix:seq"),
              emittedAt: new Date().toISOString(),
              payload: { channelId: payload.channelId, userId },
              audience: { channelId: payload.channelId },
              origin: userId,
            }),
          );
        }
      } catch {
        /* malformed frame — ignore rather than dropping the connection */
      }
    });

    socket.on("close", async () => {
      clients.delete(client);
      const stillConnected = [...clients].some((other) => other.userId === userId);
      if (stillConnected) return;

      await redis.del(presenceKey(userId));
      await query(`UPDATE users SET presence = 'offline' WHERE id = $1`, [userId]);
      await redis.publish(
        REALTIME_CHANNEL,
        JSON.stringify({
          event: "user.offline",
          seq: await redis.incr("helix:seq"),
          emittedAt: new Date().toISOString(),
          payload: { userId, status: "offline" },
          audience: {},
        }),
      );
    });
  });

  // Fan events from Redis out to the sockets this process owns.
  const subscriber = createSubscriber();
  await subscriber.subscribe(REALTIME_CHANNEL);
  subscriber.on("message", (_channel, raw) => {
    let envelope: {
      event?: string;
      audience?: { userIds?: string[]; channelId?: string };
      origin?: string;
    };
    try {
      envelope = JSON.parse(raw);
    } catch {
      return;
    }

    // Membership is cached for the life of a connection, so a member added to a
    // channel would receive nothing from it until they reloaded. Re-read the
    // set for anyone the change names.
    if (envelope.event === "channel.membership") {
      const affected = envelope.audience?.userIds;
      for (const client of clients) {
        const isNamed = affected ? affected.includes(client.userId) : true;
        if (!isNamed && !shouldDeliver(client, envelope.audience ?? {})) continue;
        void channelsFor(client.userId)
          .then((channelIds) => {
            client.channelIds = channelIds;
          })
          .catch(() => undefined);
      }
    }

    for (const client of clients) {
      if (envelope.origin === client.userId) continue; // don't echo to the sender
      if (!shouldDeliver(client, envelope.audience ?? {})) continue;
      if (client.socket.readyState === client.socket.OPEN) client.socket.send(raw);
    }
  });

  // Drop sockets that stop answering rather than leaking them.
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.isAlive) {
        client.socket.terminate();
        clients.delete(client);
        continue;
      }
      client.isAlive = false;
      client.socket.ping();
    }
  }, 30_000);

  httpServer.listen(env.wsPort, () => {
    console.log(`[ws] listening on :${env.wsPort}`);
  });

  const shutdown = async () => {
    clearInterval(heartbeat);
    wss.close();
    httpServer.close();
    await subscriber.quit();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[ws] failed to start", error);
  process.exit(1);
});
