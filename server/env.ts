/** Server-side configuration. Never imported from client components. */

const isProduction = process.env.NODE_ENV === "production";

/**
 * A value that must be set in production, with a convenience default for
 * development.
 *
 * The fallback is deliberately *not* honoured in production. A default that
 * quietly applies is worse than a crash: a missing DATABASE_URL would point a
 * production deployment at localhost, and a missing ENCRYPTION_SECRET would
 * encrypt real credentials with a value committed to this repository. Failing
 * at boot is the only safe behaviour.
 */
function required(name: string, devFallback?: string): string {
  const value = process.env[name];
  if (value) return value;

  if (isProduction) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Development defaults are not applied when NODE_ENV=production.`,
    );
  }
  if (devFallback === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return devFallback;
}

/**
 * A secret that must also be *strong* in production.
 *
 * Requiring it to be set is not enough if what gets set is "changeme".
 */
function requiredSecret(name: string, devFallback: string, minLength = 24): string {
  const value = required(name, devFallback);
  if (isProduction && value.length < minLength) {
    throw new Error(
      `${name} must be at least ${minLength} characters in production (got ${value.length}).`,
    );
  }
  if (isProduction && value === devFallback) {
    throw new Error(`${name} is still set to its development default.`);
  }
  return value;
}

/**
 * Memoises a value and computes it on first *access*, not on import.
 *
 * `next build` sets NODE_ENV=production and imports every route module to
 * collect metadata, with none of the runtime environment present. Validating at
 * module load meant a correct production guard failed a perfectly ordinary
 * build. Configuration should be read when it is used, which is also when a
 * missing value actually matters.
 */
function lazy<T>(compute: () => T): () => T {
  let cached: { value: T } | undefined;
  return () => (cached ??= { value: compute() }).value;
}

const databaseUrl = lazy(() =>
  required("DATABASE_URL", "postgresql://helix:helix@localhost:5434/helix"),
);
const redisUrl = lazy(() => required("REDIS_URL", "redis://localhost:6381"));
const encryptionSecret = lazy(() =>
  requiredSecret("ENCRYPTION_SECRET", "helix-development-encryption-secret"),
);

export const env = {
  get databaseUrl() {
    return databaseUrl();
  },
  get redisUrl() {
    return redisUrl();
  },
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
  get encryptionSecret() {
    return encryptionSecret();
  },
  /**
   * Allows outbound integrations to reach private addresses.
   *
   * Defaults to *permissive in development and blocked in production*, rather
   * than to a single value people must remember to change. Local integrations
   * run on localhost, so a safe-by-default flag had to be switched on in every
   * developer's env file — which then got copied into production, where a URL
   * box that reaches the internal network is server-side request forgery with a
   * form around it.
   *
   * Setting the variable explicitly still wins either way, for the self-hosted
   * deployment whose integrations genuinely are internal.
   */
  allowPrivateOutbound:
    process.env.OUTBOUND_ALLOW_PRIVATE === "true"
      ? true
      : process.env.OUTBOUND_ALLOW_PRIVATE === "false"
        ? false
        : !isProduction,
  /** Public origin, used to build webhook URLs shown to administrators. */
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:3000",
  wsPort: Number(process.env.WS_PORT ?? 3101),
  /**
   * The workspace a sign-in resolves against — and the only thing this value
   * may be used for.
   *
   * Everywhere else the workspace comes from the caller's session, because the
   * session knows it. Sign-in is the one point where no session exists yet, and
   * the `users` unique constraints are per-workspace (`workspace_id, email`),
   * so an address alone does not identify an account.
   *
   * This makes the deployment single-tenant by decision rather than by
   * accident. Serving a second workspace means resolving it from the request —
   * a subdomain, or a workspace field on the sign-in form — and changing
   * nothing else, since no other code path reads this.
   */
  defaultWorkspaceId: "ws_northwind",
};
