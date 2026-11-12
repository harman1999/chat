/**
 * Refuses to start a production server on unsafe configuration.
 *
 * Development has fallbacks so a clean checkout runs. In production a fallback
 * is a vulnerability: with no ENCRYPTION_SECRET the app would quietly encrypt
 * every stored credential (outgoing OAuth tokens, the single sign-on client
 * secret) with a key that is printed in the source code, and with no
 * DATABASE_URL it would try the default password. Failing at start, loudly and
 * listing everything wrong, is better than running exposed.
 *
 * Run when the server starts, not when it is built, so a build machine does not
 * need production secrets.
 */
const KNOWN_WEAK_SECRETS = [/^helix-development/i, /^change-?me/i, /^secret$/i, /^password$/i, /^test/i, /^ci-only/i];

export function productionConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  const secret = env.ENCRYPTION_SECRET ?? "";
  if (!secret) {
    problems.push("ENCRYPTION_SECRET is not set (it encrypts stored credentials; generate one with `openssl rand -base64 32`).");
  } else if (secret.length < 32 || KNOWN_WEAK_SECRETS.some((pattern) => pattern.test(secret))) {
    problems.push("ENCRYPTION_SECRET is a placeholder or too short — use at least 32 random characters (`openssl rand -base64 32`).");
  }

  if (!env.DATABASE_URL) problems.push("DATABASE_URL is not set.");
  else if (/\/\/helix:helix@/.test(env.DATABASE_URL)) problems.push("DATABASE_URL still uses the default helix:helix password.");

  if (!env.REDIS_URL) problems.push("REDIS_URL is not set.");

  if (!env.PUBLIC_URL) problems.push("PUBLIC_URL is not set (it is used for webhook URLs, invite links, emailed links and single sign-on).");
  else if (!/^https:\/\//i.test(env.PUBLIC_URL)) problems.push("PUBLIC_URL must be an https:// address in production.");

  return problems;
}

export function assertProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const problems = productionConfigProblems(env);
  if (problems.length > 0) {
    throw new Error(`Unsafe production configuration:\n - ${problems.join("\n - ")}`);
  }
  if (env.OUTBOUND_ALLOW_PRIVATE === "true") {
    console.warn("[config] OUTBOUND_ALLOW_PRIVATE=true: webhooks and single sign-on may reach private addresses. Leave it off unless you need it.");
  }
  if (env.NEXT_PUBLIC_USE_MOCK !== "false") {
    console.warn('[config] NEXT_PUBLIC_USE_MOCK is not "false": the client would run on fixtures instead of the API.');
  }
  if (!env.TRUSTED_PROXY_HOPS) {
    console.warn("[config] TRUSTED_PROXY_HOPS is not set; assuming 1 reverse proxy in front. Set it to the real number (0 if none).");
  }
}
