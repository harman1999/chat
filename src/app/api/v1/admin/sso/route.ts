import { env } from "@server/env";
import { audit } from "@server/lib/audit";
import { handler, json, parseBody, problem } from "@server/lib/http";
import { discover, OidcError } from "@server/lib/oidc";
import { OutboundError } from "@server/lib/outbound";
import { requirePermission } from "@server/lib/permissions";
import { ssoConfigSchema } from "@server/lib/schemas";
import { requireUserSession } from "@server/lib/session";
import { ssoRepo } from "@server/repo/sso";

const redirectUri = `${env.publicUrl}/api/v1/auth/sso/callback`;

/** The setting, without its secret: only whether one is stored. */
export const GET = handler(async () => {
  const { user, workspaceId } = await requireUserSession();
  await requirePermission(user.id, "p_admin_auth");
  const config = await ssoRepo.get(workspaceId);
  return json({
    enabled: false,
    label: "Single sign-on",
    issuer: "",
    clientId: "",
    hasSecret: false,
    allowedDomains: [],
    autoCreate: false,
    enforced: false,
    ...config,
    redirectUri,
  });
});

export const PUT = handler(async (request: Request) => {
  const { user, workspaceId } = await requireUserSession();
  await requirePermission(user.id, "p_admin_auth");
  const body = await parseBody(request, ssoConfigSchema);
  const stored = await ssoRepo.get(workspaceId);

  // A new account from a provider's say-so, with no domain limit, would let
  // anyone who can sign in there — on a public provider, anyone — into the workspace.
  if (body.autoCreate && body.allowedDomains.length === 0) {
    return problem(422, "domain_required", "Name at least one email domain before letting people create their own accounts.");
  }
  if (body.enforced && !body.enabled) {
    return problem(422, "not_enabled", "Single sign-on has to be on before it can be required.");
  }
  if (body.enabled) {
    if (!body.clientSecret && !stored?.hasSecret) {
      return problem(422, "secret_required", "Enter the client secret before turning single sign-on on.");
    }
    try {
      await discover(body.issuer, { fresh: true });
    } catch (error) {
      if (error instanceof OidcError || error instanceof OutboundError) return problem(422, "provider_unreachable", error.message);
      throw error;
    }
  }
  // Requiring it switches passwords off for everyone but the owner, so the
  // person doing it must have proved it works by signing in that way once.
  if (body.enforced && !(await ssoRepo.hasIdentity(user.id))) {
    return problem(
      422,
      "try_first",
      "Sign in once with single sign-on yourself before requiring it, so you know it works. The owner can always use a password.",
    );
  }

  await ssoRepo.save(workspaceId, body);
  await audit({
    actorId: user.id,
    action: "sso.config_changed",
    category: "auth",
    severity: "warning",
    target: `${body.enabled ? "on" : "off"}${body.enforced ? ", required" : ""} · ${body.issuer}`,
    request,
  });
  return json({ ...(await ssoRepo.get(workspaceId)), redirectUri });
});
