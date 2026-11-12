import { handler, json, parseBody, problem } from "@server/lib/http";
import { discover, OidcError } from "@server/lib/oidc";
import { OutboundError } from "@server/lib/outbound";
import { requirePermission } from "@server/lib/permissions";
import { ssoTestSchema } from "@server/lib/schemas";
import { requireUserSession } from "@server/lib/session";

/** Checks an issuer address before it is saved: can it be reached, and is it what it says. */
export const POST = handler(async (request: Request) => {
  const { user } = await requireUserSession();
  await requirePermission(user.id, "p_admin_auth");
  const { issuer } = await parseBody(request, ssoTestSchema);
  try {
    const meta = await discover(issuer, { fresh: true });
    return json({ ok: true, authorizationEndpoint: meta.authorization_endpoint, tokenEndpoint: meta.token_endpoint });
  } catch (error) {
    if (error instanceof OidcError || error instanceof OutboundError) return problem(422, "provider_unreachable", error.message);
    throw error;
  }
});
