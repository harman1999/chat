import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import type { RateLimitRule } from "@server/lib/rate-limit";
import { acceptInviteSchema } from "@server/lib/schemas";
import { signInAs } from "@server/lib/session";
import { invitesRepo, type InviteProblem } from "@server/repo/invites";

/**
 * Public by necessity: the person opening an invite has no account yet. The
 * token in the path is the credential. Bucketed by IP and kept tight, because
 * this is the one place an anonymous caller can create an account.
 */
const JOIN_RULE: RateLimitRule = { limit: 20, windowSeconds: 600, scope: "ip", name: "join" };

const MESSAGE: Record<InviteProblem, string> = {
  not_found: "This invite link is not valid. Check you copied all of it.",
  expired: "This invite link has expired. Ask whoever sent it for a new one.",
  revoked: "This invite link has been turned off. Ask whoever sent it for a new one.",
  used_up: "This invite link has been used as many times as it allows. Ask for a new one.",
};

export const GET = handler(
  async (_request: Request, ctx: { params: Promise<{ token: string }> }) => {
    const { token } = await ctx.params;
    const result = await invitesRepo.preview(token);
    if (!result.ok) return problem(410, result.reason, MESSAGE[result.reason]);
    return json(result.preview);
  },
  { rateLimit: JOIN_RULE },
);

export const POST = handler(
  async (request: Request, ctx: { params: Promise<{ token: string }> }) => {
    const { token } = await ctx.params;
    const body = await parseBody(request, acceptInviteSchema);

    const result = await invitesRepo.accept({ token, ...body });

    if (!result.ok) {
      if (result.reason !== "account") {
        return problem(410, result.reason, MESSAGE[result.reason]);
      }
      // The account itself was refused — most often an address already in use.
      return result.result.reason === "email_taken"
        ? problem(409, "email_taken", "That email already has an account. Sign in instead.")
        : problem(409, result.result.reason, "Could not create the account with those details.");
    }

    // Signed straight in: joining and then being asked to sign in again with
    // the password just chosen is a step with no purpose.
    await signInAs(result.userId, request);

    await audit({
      actorId: result.userId,
      action: "invite.accepted",
      category: "user",
      severity: "info",
      target: body.email,
      request,
    });

    return json({ ok: true }, { status: 201 });
  },
  { rateLimit: JOIN_RULE },
);
