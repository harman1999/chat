import { handler, json, parseBody, problem } from "@server/lib/http";
import { publish } from "@server/lib/events";
import { incomingWebhookPayloadSchema } from "@server/lib/schemas";
import { integrationsRepo } from "@server/repo/integrations";
import { messagesRepo } from "@server/repo/messages";
import type { RateLimitRule } from "@server/lib/rate-limit";

/**
 * A webhook is called by machines, so it is bucketed by IP and allowed a much
 * higher rate than a person would ever need.
 */
const WEBHOOK_RULE: RateLimitRule = {
  limit: 600,
  windowSeconds: 60,
  scope: "ip",
  name: "incoming-webhook",
};

/**
 * Receives a post from an external system.
 *
 * The only endpoint in the API with no session: the secret in the path *is* the
 * credential. That makes the URL itself sensitive, which is why it is shown
 * once at creation and stored only as a hash.
 */
export const POST = handler(
  async (request: Request, ctx: { params: Promise<{ secret: string }> }) => {
    const { secret } = await ctx.params;
    const hook = await integrationsRepo.findIncomingBySecret(secret);

    // One answer for "no such webhook" and "disabled webhook", so the endpoint
    // cannot be used to discover which secrets exist.
    if (!hook || !hook.is_enabled) {
      return problem(404, "not_found", "No active webhook for this URL");
    }

    const body = await parseBody(request, incomingWebhookPayloadSchema);

    const message = await messagesRepo.create({
      channelId: hook.channel_id,
      authorId: hook.bot_user_id,
      body: body.text,
      threadRootId: null,
    });

    await integrationsRepo.recordIncomingUse(hook.id);
    await publish("message.created", message, { channelId: hook.channel_id });

    return json({ ok: true, messageId: message.id }, { status: 201 });
  },
  { rateLimit: WEBHOOK_RULE },
);
