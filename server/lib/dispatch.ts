import { getConnectionToken } from "./oauth-client";
import { deliver } from "./outbound";
import { increment } from "./metrics";
import { integrationsRepo } from "../repo/integrations";
import type { Message, User } from "../../src/types";

/**
 * Fans a new message out to any outgoing webhooks that match it.
 *
 * Deliberately not awaited by the route that posts the message. A slow or
 * broken external endpoint must not delay the sender's response, and a failed
 * delivery must not fail the message — the message is the product, the webhook
 * is a side effect. Failures are recorded against the webhook so a broken
 * endpoint is visible in the admin list rather than silent.
 */
export function dispatchOutgoing(input: {
  workspaceId: string;
  message: Message;
  author: User;
  channelName: string;
}): void {
  // A bot's own post must not re-trigger a webhook that posted it — that is a
  // loop that fills a channel until someone notices.
  if (input.author.isBot) return;

  void (async () => {
    try {
      const hooks = await integrationsRepo.matchOutgoing(
        input.workspaceId,
        input.message.channelId,
        input.message.body,
      );
      if (hooks.length === 0) return;

      await Promise.all(
        hooks.map(async (hook) => {
          // A connection that cannot produce a token yields null; the delivery
          // still goes out unauthenticated rather than being dropped, and the
          // reason is recorded against the connection.
          const auth = hook.connection_id
            ? await getConnectionToken(hook.connection_id, input.workspaceId)
            : null;

          const result = await deliver(hook.target_url, hook.signing_secret, {
            type: "message",
            workspaceId: input.workspaceId,
            channelId: input.message.channelId,
            channelName: input.channelName,
            messageId: input.message.id,
            userId: input.author.id,
            userName: input.author.displayName,
            text: input.message.body,
            timestamp: input.message.createdAt,
          }, auth?.accessToken);

          await integrationsRepo.recordDelivery(hook.id, result);
          increment(result.ok ? "webhook.delivered" : "webhook.failed", hook.name);
        }),
      );
    } catch (error) {
      // Nothing above should throw, but this runs detached: an unhandled
      // rejection here would take the process down rather than lose a webhook.
      console.error("[dispatch] outgoing webhook fan-out failed", error);
    }
  })();
}
