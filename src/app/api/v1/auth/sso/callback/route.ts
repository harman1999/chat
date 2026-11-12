import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@server/env";
import { audit } from "@server/lib/audit";
import { handler } from "@server/lib/http";
import { discover, exchangeCode, safeRedirectPath, verifyIdToken, type IdClaims } from "@server/lib/oidc";
import { SSO_RULE } from "@server/lib/rate-limit";
import { redis } from "@server/lib/redis";
import { signInAs } from "@server/lib/session";
import { ssoRepo, type SsoConfig } from "@server/repo/sso";
import { usersRepo } from "@server/repo/users";
import { SSO_COOKIE, ssoStateKey } from "@server/lib/sso-state";

type Failure =
  | "denied" | "expired" | "failed" | "no_email" | "no_account" | "domain_not_allowed" | "deactivated" | "not_configured";

const back = (code: Failure) => {
  const response = NextResponse.redirect(new URL(`/login?sso_error=${code}`, env.publicUrl));
  response.cookies.delete({ name: SSO_COOKIE, path: "/api/v1/auth/sso" });
  return response;
};

/**
 * Who this sign-in is, as an account in the workspace: the person already linked
 * to this provider identity; else the one whose email matches (the provider
 * having verified it); else a new Member, if that is allowed. A domain list, when
 * there is one, applies to everyone who is not yet linked.
 */
async function resolveUser(
  workspaceId: string,
  config: SsoConfig,
  claims: IdClaims,
): Promise<{ userId: string } | { failure: Failure }> {
  const linked = await ssoRepo.userForIdentity(workspaceId, config.issuer, claims.sub);
  if (linked) return { userId: linked };

  if (!claims.email || !claims.emailVerified) return { failure: "no_email" };
  const domain = claims.email.split("@")[1] ?? "";
  if (config.allowedDomains.length > 0 && !config.allowedDomains.includes(domain)) {
    return { failure: "domain_not_allowed" };
  }

  const existing = await usersRepo.findByEmail(workspaceId, claims.email);
  if (existing) {
    if (existing.is_bot) return { failure: "no_account" };
    await ssoRepo.link(workspaceId, config.issuer, claims.sub, existing.id);
    return { userId: existing.id };
  }

  if (!config.autoCreate) return { failure: "no_account" };

  const fullName = claims.name || claims.email.split("@")[0];
  // A password nobody knows: this account signs in through the provider.
  const password = randomBytes(32).toString("base64url");
  for (let attempt = 0; attempt < 4; attempt++) {
    const base = fullName.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "user";
    const created = await usersRepo.create({
      workspaceId,
      fullName,
      email: claims.email,
      password,
      username: attempt === 0 ? undefined : `${base}${Math.floor(100 + Math.random() * 900)}`,
      channels: ["general"],
    });
    if (created.ok) {
      await ssoRepo.link(workspaceId, config.issuer, claims.sub, created.user.id);
      return { userId: created.user.id };
    }
    if (created.reason === "unknown_channels") {
      const plain = await usersRepo.create({ workspaceId, fullName, email: claims.email, password });
      if (!plain.ok) return { failure: "failed" };
      await ssoRepo.link(workspaceId, config.issuer, claims.sub, plain.user.id);
      return { userId: plain.user.id };
    }
    if (created.reason !== "username_taken") return { failure: "failed" };
  }
  return { failure: "failed" };
}

/** Where the provider sends the person back to. Finishes the sign-in, or says why not. */
export const GET = handler(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  if (params.get("error")) return back("denied");

  const state = params.get("state");
  const code = params.get("code");
  const cookie = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${SSO_COOKIE}=([^;]+)`))?.[1];
  // The browser finishing the login must be the one that started it.
  if (!state || !code || !cookie || decodeURIComponent(cookie) !== state) return back("expired");

  // Read and removed in one step: a state works once.
  const saved = await redis.getdel(ssoStateKey(state));
  if (!saved) return back("expired");
  const attempt = JSON.parse(saved) as { workspaceId: string; verifier: string; nonce: string; next: string };

  const config = await ssoRepo.forSignIn(attempt.workspaceId);
  if (!config?.enabled) return back("not_configured");

  let claims: IdClaims;
  try {
    const meta = await discover(config.issuer);
    const idToken = await exchangeCode(meta, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      verifier: attempt.verifier,
      redirectUri: `${env.publicUrl}/api/v1/auth/sso/callback`,
    });
    claims = await verifyIdToken(idToken, meta, { clientId: config.clientId, nonce: attempt.nonce });
  } catch (error) {
    console.error("[sso] sign-in failed:", String(error));
    return back("failed");
  }

  const resolved = await resolveUser(attempt.workspaceId, config, claims);
  if ("failure" in resolved) return back(resolved.failure);

  const user = await usersRepo.get(resolved.userId);
  const status = await usersRepo.accountStatus(resolved.userId);
  if (!user || status === "deactivated") return back("deactivated");

  await signInAs(user.id, request);
  await audit({
    actorId: user.id,
    action: "auth.sso_login",
    category: "auth",
    severity: "info",
    target: `${user.email} via ${config.label}`,
    request,
  });

  const response = NextResponse.redirect(new URL(safeRedirectPath(attempt.next), env.publicUrl));
  response.cookies.delete({ name: SSO_COOKIE, path: "/api/v1/auth/sso" });
  return response;
}, { rateLimit: SSO_RULE });
