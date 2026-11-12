import { createHash, randomBytes } from "node:crypto";

/**
 * What the browser holds is a random token; what the server stores, keys by and
 * shows is only its SHA-256. A copy of the database, of Redis, or of the
 * "active sessions" list therefore contains nothing that can be replayed as a
 * cookie, and the token is never returned in an API response.
 *
 * Kept free of framework imports because the WebSocket gateway, a separate
 * process, authenticates with it too.
 */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionIdFor(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
