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
import { startRetentionJob } from "../jobs/retention";
import { assertProductionConfig } from "../lib/production-check";
import { sessionIdFor } from "../lib/session-token";
import { createSubscriber, presenceKey, redis, REALTIME_CHANNEL, sessionKey } from "../lib/redis";

interface Client {
  socket: WebSocket;
  userId: string;
  /** Channels the user belongs to, cached for the life of the connection. */
  channelIds: Set<string>;
  /** Their workspace, for events addressed to a whole workspace (presence). */
  workspaceId: string;
  isAlive: boolean;
  /** Which session opened it, so a revoked session can be cut off. */
  sessionId: string;
  /** Frames received in the current second, for flood control. */
  frames: number;
  windowStart: number;
}

const clients = new Set<Client>();

/** The only client frames are small typing notices; anything bigger is abuse. */
const MAX_FRAME_BYTES = 4 * 1024;
const MAX_FRAMES_PER_SECOND = 20;
const MAX_SOCKETS_PER_USER = 10;
const MAX_SOCKETS_TOTAL = 5_000;

/** Browsers always send Origin on a WebSocket handshake; tools may not. */
function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(env.publicUrl).host;
  } catch {
    return false;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [name, ...rest] = part.trim().split("=");
      return [name, decodeURIComponent(rest.join("="))];
    }),
  );
}

/** Whether this session still exists. Redis first; Postgres if Redis lost it. */
async function sessionUser(sessionId: string): Promise<string | null> {
  const cached = await redis.get(sessionKey(sessionId));
  if (cached) return cached;
  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM sessions WHERE id = $1 AND expires_at > now()`,
    [sessionId],
  );
  return row?.user_id ?? null;
}

async function authenticate(cookieHeader: string | undefined) {
  // The cookie only. A token in the URL would end up in access logs and in
  // browser history, so it is not accepted.
  const raw = parseCookies(cookieHeader)[env.sessionCookie];
  if (!raw || raw.length > 200) return null;
  const sessionId = sessionIdFor(raw);
  const userId = await sessionUser(sessionId);
  return userId ? { userId, sessionId } : null;
}

async function channelsFor(userId: string): Promise<Set<string>> {
  const rows = await query<{ channel_id: string }>(
    `SELECT channel_id FROM channel_members WHERE user_id = $1`,
    [userId],
  );
  return new Set(rows.map((row) => row.channel_id));
}

async function workspaceOf(userId: string): Promise<string> {
  const row = await queryOne<{ workspace_id: string }>(
    `SELECT workspace_id FROM users WHERE id = $1`,
    [userId],
  );
  return row?.workspace_id ?? "";
}

/**
 * An event reaches a client if it is addressed to them, to a channel they are
 * in, or to their workspace. Nothing is broadcast to every connection: an
 * unaddressed event reaches nobody, since "everyone" would span workspaces.
 */
function shouldDeliver(
  client: Client,
  audience: { userIds?: string[]; channelId?: string; workspaceId?: string },
): boolean {
  if (audience.userIds?.includes(client.userId)) return true;
  if (audience.channelId && client.channelIds.has(audience.channelId)) return true;
  if (audience.workspaceId && audience.workspaceId === client.workspaceId) return true;
  return false;
}

async function main() {
  assertProductionConfig();
  const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
      // Nothing about load or who is connected: this port is reachable by anyone.
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.writeHead(426);
    response.end("Upgrade required");
  });

  const wss = new WebSocketServer({
    server: httpServer,
    // The library default is 100 MiB per frame, held in memory.
    maxPayload: MAX_FRAME_BYTES,
    // Refused during the handshake, before a socket exists: a page on another
    // origin must not be able to open this connection with the visitor's cookie.
    verifyClient: (info: { origin?: string }) => originAllowed(info.origin),
  });

  // A malformed or oversized frame makes the library emit "error" on that one
  // connection. With no listener Node treats it as fatal, so a single bad frame
  // from any client used to take the whole gateway down for everyone.
  wss.on("error", (error) => console.error("[ws] server error:", String(error)));

  wss.on("connection", async (socket, request) => {
    // Attached first, before anything is awaited: an error during sign-in checks
    // must be absorbed too. The library closes the socket itself (1009 for too
    // big, 1002 for a protocol error) after emitting.
    socket.on("error", (error) => console.error("[ws] socket error:", (error as Error).message));
    const auth = await authenticate(request.headers.cookie);

    if (!auth) {
      socket.close(4001, "Unauthorized");
      return;
    }
    const { userId, sessionId } = auth;

    if (clients.size >= MAX_SOCKETS_TOTAL || [...clients].filter((c) => c.userId === userId).length >= MAX_SOCKETS_PER_USER) {
      socket.close(4008, "Too many connections");
      return;
    }

    // Registered and counted from the first instant, with its listeners attached
    // before anything is awaited. They used to be attached after the lookups
    // below, so frames sent in that window were dropped (the flood limit never
    // saw them) and a socket that closed during it was never cleaned up, leaving
    // a phantom entry that counted against the connection caps.
    const client: Client = {
      socket,
      userId,
      channelIds: new Set(),
      workspaceId: "",
      isAlive: true,
      sessionId,
      frames: 0,
      windowStart: Date.now(),
    };
    clients.add(client);
    let ready = false;

    socket.on("pong", () => {
      client.isAlive = true;
    });

    socket.on("message", async (raw) => {
      // Each frame fans out through Redis, so a flood from one socket would be
      // amplified to everyone in the channel.
      const now = Date.now();
      if (now - client.windowStart >= 1_000) {
        client.windowStart = now;
        client.frames = 0;
      }
      if (++client.frames > MAX_FRAMES_PER_SECOND) {
        socket.close(4029, "Slow down");
        return;
      }
      if (!ready) return; // still loading who this is; nothing to relay yet
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
      try {
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
          audience: { workspaceId: client.workspaceId },
        }),
      );
      } catch (error) {
        // A database or Redis hiccup while announcing someone left must not
        // become an unhandled rejection, which also stops the process.
        console.error("[ws] could not announce disconnect:", String(error));
      }
    });

    try {
      const [channelIds, workspaceId] = await Promise.all([channelsFor(userId), workspaceOf(userId)]);
      client.channelIds = channelIds;
      client.workspaceId = workspaceId;
      // Gone already? The close handler has run; announcing "online" now would
      // leave them shown as online with nobody connected.
      if (socket.readyState !== socket.OPEN) return;
      ready = true;

      await redis.set(presenceKey(userId), "online", "EX", 120);
      await query(`UPDATE users SET presence = 'online', last_active_at = now() WHERE id = $1`, [userId]);
      await redis.publish(
        REALTIME_CHANNEL,
        JSON.stringify({
          event: "user.online",
          seq: await redis.incr("helix:seq"),
          emittedAt: new Date().toISOString(),
          payload: { userId, status: "online" },
          audience: { workspaceId: client.workspaceId },
        }),
      );
    } catch (error) {
      console.error("[ws] could not set up a connection:", String(error));
      socket.close(1011, "Server error");
    }
  });

  // Fan events from Redis out to the sockets this process owns.
  const subscriber = createSubscriber();
  await subscriber.subscribe(REALTIME_CHANNEL);
  subscriber.on("message", (_channel, raw) => {
    let envelope: {
      event?: string;
      audience?: { userIds?: string[]; channelId?: string; workspaceId?: string };
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
      // Signing out, a password change or a deactivation ends the session; the
      // socket it opened must end too, not keep receiving messages.
      void sessionUser(client.sessionId)
        .then((still) => {
          if (!still) {
            client.socket.close(4001, "Signed out");
            clients.delete(client);
          }
        })
        .catch(() => undefined);
    }
  }, 30_000);

  httpServer.listen(env.wsPort, () => {
    console.log(`[ws] listening on :${env.wsPort}`);
  });

  // The only long-running process besides the web server, so scheduled work
  // lives here rather than in a separate one nobody would remember to start.
  const stopJobs = startRetentionJob();

  const shutdown = async () => {
    clearInterval(heartbeat);
    stopJobs();
    wss.close();
    httpServer.close();
    await subscriber.quit();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// One misbehaving connection or one failed query must not stop the gateway for
// everyone else; log it and keep serving.
process.on("unhandledRejection", (reason) => console.error("[ws] unhandled rejection:", String(reason)));
process.on("uncaughtException", (error) => console.error("[ws] uncaught exception:", error));

main().catch((error) => {
  console.error("[ws] failed to start", error);
  process.exit(1);
});
