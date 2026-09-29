/** Server-side configuration. Never imported from client components. */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL", "postgresql://helix:helix@localhost:5434/helix"),
  redisUrl: required("REDIS_URL", "redis://localhost:6381"),
  sessionCookie: "helix_session",
  sessionTtlSeconds: 60 * 60 * 24 * 30,
  storageDir: process.env.STORAGE_DIR ?? "./.storage",
  /**
   * Encrypts outgoing OAuth client secrets and tokens at rest.
   *
   * Has a development fallback so the app runs from a clean checkout, but
   * rotating it makes every stored connection undecryptable — which is the
   * correct failure, since the alternative is silently trusting a default.
   */
  encryptionSecret: required("ENCRYPTION_SECRET", "helix-development-encryption-secret"),
  /**
   * Allows outbound integrations to reach private addresses.
   *
   * Off by default, because a URL box that can reach the internal network is
   * server-side request forgery with a form around it. Self-hosted deployments
   * whose integrations genuinely live on the same private network turn it on
   * deliberately — and accept that anyone who can create a webhook can then
   * make this server talk to anything it can reach.
   */
  allowPrivateOutbound: process.env.OUTBOUND_ALLOW_PRIVATE === "true",
  /** Public origin, used to build webhook URLs shown to administrators. */
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:3000",
  wsPort: Number(process.env.WS_PORT ?? 3101),
  // No default workspace: sign-in finds the account by email across
  // workspaces and asks which one when there are several (auth/login).
};
