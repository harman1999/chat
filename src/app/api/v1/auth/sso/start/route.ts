import { NextResponse } from "next/server";
import { env } from "@server/env";
import { handler } from "@server/lib/http";
import { authorizationUrl, discover, newLoginRequest, safeRedirectPath } from "@server/lib/oidc";
import { SSO_RULE } from "@server/lib/rate-limit";
import { redis } from "@server/lib/redis";
import { SSO_COOKIE, SSO_STATE_TTL_SECONDS, ssoStateKey } from "@server/lib/sso-state";
import { ssoRepo } from "@server/repo/sso";

const back = (code: string) => NextResponse.redirect(new URL(`/login?sso_error=${code}`, env.publicUrl));

/**
 * Sends the browser to the provider.
 *
 * What the callback must remember (the PKCE verifier, the nonce, where to land)
 * is kept in Redis under a random `state` for ten minutes. The same `state` goes
 * in a cookie, so the callback can tell the browser that finishes the login is
 * the one that started it — otherwise anyone could hand a victim a link that
 * signs them in as the attacker.
 */
export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const workspace = await ssoRepo.loginWorkspace(params.get("workspace"));
  const config = workspace ? await ssoRepo.forSignIn(workspace.id) : null;
  if (!workspace || !config?.enabled) return back("not_configured");

  let url: string;
  const attempt = newLoginRequest();
  try {
    const meta = await discover(config.issuer);
    url = authorizationUrl(meta, {
      clientId: config.clientId,
      redirectUri: `${env.publicUrl}/api/v1/auth/sso/callback`,
      state: attempt.state,
      nonce: attempt.nonce,
      challenge: attempt.challenge,
    });
  } catch (error) {
    console.error("[sso] could not start:", String(error));
    return back("failed");
  }

  await redis.set(
    ssoStateKey(attempt.state),
    JSON.stringify({
      workspaceId: workspace.id,
      verifier: attempt.verifier,
      nonce: attempt.nonce,
      next: safeRedirectPath(params.get("next")),
    }),
    "EX",
    SSO_STATE_TTL_SECONDS,
  );

  const response = NextResponse.redirect(url);
  response.cookies.set(SSO_COOKIE, attempt.state, {
    httpOnly: true,
    // Lax, not Strict: the provider sends the browser back with a top-level GET.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/v1/auth/sso",
    maxAge: SSO_STATE_TTL_SECONDS,
  });
  return response;
}, { rateLimit: SSO_RULE });
