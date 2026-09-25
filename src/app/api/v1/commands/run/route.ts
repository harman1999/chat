import { handler, json, parseBody, problem } from "@server/lib/http";
import { getConnectionToken } from "@server/lib/oauth-client";
import { deliver } from "@server/lib/outbound";
import { publish } from "@server/lib/events";
import { UPLOAD_RULE } from "@server/lib/rate-limit";
import { runSlashCommandSchema } from "@server/lib/schemas";
import { ForbiddenError, requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";
import { integrationsRepo } from "@server/repo/integrations";
import { messagesRepo } from "@server/repo/messages";
import type { SlashCommandResult } from "@/types";

/**
 * Runs a slash command.
 *
 * The external service is called from here rather than from the browser, so the
 * signing secret stays on the server and the target is subject to the same
 * outbound checks as everything else.
 */
export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  const body = await parseBody(request, runSlashCommandSchema);

  if (!(await channelsRepo.isMember(body.channelId, user.id))) {
    throw new ForbiddenError("You are not a member of this channel");
  }

  const command = await integrationsRepo.findCommand(workspaceId, body.command);
  if (!command) return problem(404, "unknown_command", `/${body.command} is not a command here`);

  const auth = command.connection_id
    ? await getConnectionToken(command.connection_id, workspaceId)
    : null;

  const result = await deliver(command.target_url, command.signing_secret, {
    type: "slash_command",
    command: `/${command.command}`,
    text: body.text,
    channelId: body.channelId,
    userId: user.id,
    userName: user.displayName,
    workspaceId,
  }, auth?.accessToken);

  await integrationsRepo.recordCommandUse(command.id);

  if (!result.ok) {
    return problem(502, "command_failed", result.error ?? "The command did not respond");
  }

  // A command may answer with nothing, plain text, or a shaped reply.
  let reply: SlashCommandResult = { responseType: "ephemeral", text: result.body.slice(0, 4_000) };
  try {
    const parsed = JSON.parse(result.body) as Partial<SlashCommandResult>;
    if (typeof parsed.text === "string") {
      reply = {
        responseType: parsed.responseType === "in_channel" ? "in_channel" : "ephemeral",
        text: parsed.text.slice(0, 4_000),
      };
    }
  } catch {
    // Not JSON — treat the body as the text, which is what it looks like.
  }

  // "in_channel" means everyone sees it, so it becomes a real message authored
  // by the person who ran the command.
  if (reply.responseType === "in_channel" && reply.text) {
    const message = await messagesRepo.create({
      channelId: body.channelId,
      authorId: user.id,
      body: reply.text,
      threadRootId: null,
    });
    await publish("message.created", message, { channelId: body.channelId });
  }

  return json(reply);
}, { rateLimit: UPLOAD_RULE });
