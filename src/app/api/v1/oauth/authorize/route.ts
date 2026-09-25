import { randomBytes } from "node:crypto";
import { handler, json, problem } from "@server/lib/http";
import { query } from "@server/db/client";
import { hashSecret } from "@server/lib/secrets";
import { requireUserSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

const CODE_TTL_SECONDS = 60;

/**
 * The authorization endpoint.
 *
 * Returns the consent details rather than rendering a page, so the approval UI
 * is an ordinary screen in this app. A person must be signed in with a real
 * session — an integration token cannot authorize an application on someone's
 * behalf.
 */
export const GET = handler(async (request: Request) => {
  const { user } = await requireUserSession();
  const params = new URL(request.url).searchParams;

  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";

  const app = await integrationsRepo.findAppByClientId(clientId);
  if (!app || !app.is_enabled) return problem(404, "unknown_client", "Unknown application");

  // Exact match. A prefix or wildcard match here is how an authorization code
  // gets delivered to an attacker-controlled path on a legitimate host.
  if (!app.redirect_uris.includes(redirectUri)) {
    return problem(400, "invalid_redirect_uri", "That redirect URI is not registered");
  }

  const requested = (params.get("scope") ?? "").split(" ").filter(Boolean);
  const unknown = requested.filter((scope) => !app.scopes.includes(scope));
  if (unknown.length) {
    return problem(400, "invalid_scope", `Not registered for: ${unknown.join(", ")}`);
  }

  return json({
    application: { name: app.name, clientId },
    scopes: requested.length ? requested : app.scopes,
    redirectUri,
    user: { id: user.id, displayName: user.displayName },
  });
});

/**
 * Records the person's approval and issues a single-use code.
 *
 * PKCE is required rather than optional. Without it, anyone who intercepts the
 * code — a malicious app registered for the same custom scheme, a proxy, a
 * browser extension — can redeem it, because the code alone is the proof.
 */
export const POST = handler(async (request: Request) => {
  const { user } = await requireUserSession();
  const params = new URL(request.url).searchParams;

  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const challenge = params.get("code_challenge") ?? "";
  const method = params.get("code_challenge_method") ?? "";

  const app = await integrationsRepo.findAppByClientId(clientId);
  if (!app || !app.is_enabled) return problem(404, "unknown_client", "Unknown application");
  if (!app.redirect_uris.includes(redirectUri)) {
    return problem(400, "invalid_redirect_uri", "That redirect URI is not registered");
  }
  if (!challenge || method !== "S256") {
    return problem(
      400,
      "pkce_required",
      "A code_challenge with code_challenge_method=S256 is required",
    );
  }

  const requested = (params.get("scope") ?? "").split(" ").filter(Boolean);
  const scopes = requested.length ? requested : app.scopes;
  if (requested.some((scope) => !app.scopes.includes(scope))) {
    return problem(400, "invalid_scope", "Requested a scope the application is not registered for");
  }

  const code = randomBytes(32).toString("base64url");
  await query(
    `INSERT INTO oauth_authorization_codes
       (code_hash, app_id, user_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' seconds')::interval)`,
    [hashSecret(code), app.id, user.id, redirectUri, scopes, challenge, method, CODE_TTL_SECONDS],
  );

  // Short-lived by design: the code is only ever carried from the browser to
  // the application's server, which takes milliseconds.
  return json({ code, redirectUri, expiresInSeconds: CODE_TTL_SECONDS });
});
