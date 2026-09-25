import { createHash, randomBytes, randomUUID } from "node:crypto";
import { handler, json } from "@server/lib/http";
import { query, queryOne } from "@server/db/client";
import { hashSecret, secretMatches } from "@server/lib/secrets";
import { integrationsRepo } from "@server/repo/integrations";
import type { RateLimitRule } from "@server/lib/rate-limit";

const ACCESS_TTL_SECONDS = 60 * 60;
const TOKEN_RULE: RateLimitRule = {
  limit: 60,
  windowSeconds: 60,
  scope: "ip",
  name: "oauth-token",
};

/** RFC 6749 wants `error`/`error_description`, not this API's problem shape. */
function oauthError(status: number, code: string, description: string) {
  return json({ error: code, error_description: description }, { status });
}

/**
 * The token endpoint.
 *
 * Authenticated by client credentials rather than a session, so it is one of
 * the two endpoints here that an anonymous caller may reach. Supports the
 * authorization-code and refresh-token grants.
 */
export const POST = handler(
  async (request: Request) => {
    const form = await request.formData().catch(() => null);
    if (!form) return oauthError(400, "invalid_request", "Expected a form-encoded body");

    const get = (key: string) => String(form.get(key) ?? "");
    const grantType = get("grant_type");

    const app = await integrationsRepo.findAppByClientId(get("client_id"));
    if (!app || !app.is_enabled || !secretMatches(get("client_secret"), app.client_secret_hash)) {
      // One answer for an unknown client and a wrong secret.
      return oauthError(401, "invalid_client", "Client authentication failed");
    }

    if (grantType === "authorization_code") {
      const code = get("code");
      const verifier = get("code_verifier");
      if (!code || !verifier) {
        return oauthError(400, "invalid_request", "code and code_verifier are required");
      }

      // Claimed atomically: `used_at IS NULL` in the UPDATE means two
      // simultaneous redemptions cannot both succeed.
      const row = await queryOne<{
        app_id: string; user_id: string; redirect_uri: string; scopes: string[];
        code_challenge: string;
      }>(
        `UPDATE oauth_authorization_codes
            SET used_at = now()
          WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING app_id, user_id, redirect_uri, scopes, code_challenge`,
        [hashSecret(code)],
      );
      if (!row) return oauthError(400, "invalid_grant", "The code is unknown, used or expired");

      // The code was issued to a different client.
      if (row.app_id !== app.id) {
        return oauthError(400, "invalid_grant", "That code was not issued to this client");
      }
      if (row.redirect_uri !== get("redirect_uri")) {
        return oauthError(400, "invalid_grant", "redirect_uri does not match the authorization");
      }

      const computed = createHash("sha256").update(verifier).digest("base64url");
      if (computed !== row.code_challenge) {
        return oauthError(400, "invalid_grant", "code_verifier does not match the challenge");
      }

      return issueTokens(app.id, row.user_id, row.scopes);
    }

    if (grantType === "refresh_token") {
      const presented = get("refresh_token");
      if (!presented) return oauthError(400, "invalid_request", "refresh_token is required");

      // Rotated: the old refresh token is revoked as it is redeemed, so a
      // stolen one stops working the moment the legitimate client uses theirs.
      const row = await queryOne<{ id: string; user_id: string; scopes: string[]; app_id: string }>(
        `UPDATE oauth_access_tokens SET revoked_at = now()
          WHERE refresh_token_hash = $1 AND revoked_at IS NULL
        RETURNING id, user_id, scopes, app_id`,
        [hashSecret(presented)],
      );
      if (!row || row.app_id !== app.id) {
        return oauthError(400, "invalid_grant", "The refresh token is unknown or revoked");
      }

      return issueTokens(app.id, row.user_id, row.scopes);
    }

    return oauthError(400, "unsupported_grant_type", `${grantType} is not supported`);
  },
  { rateLimit: TOKEN_RULE },
);

async function issueTokens(appId: string, userId: string, scopes: string[]) {
  const accessToken = `hlx_oat_${randomBytes(32).toString("base64url")}`;
  const refreshToken = `hlx_ort_${randomBytes(32).toString("base64url")}`;

  await query(
    `INSERT INTO oauth_access_tokens
       (id, app_id, user_id, token_hash, refresh_token_hash, scopes, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' seconds')::interval)`,
    [
      `oat_${randomUUID()}`, appId, userId,
      hashSecret(accessToken), hashSecret(refreshToken), scopes, ACCESS_TTL_SECONDS,
    ],
  );

  return json({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_SECONDS,
    scope: scopes.join(" "),
  });
}
