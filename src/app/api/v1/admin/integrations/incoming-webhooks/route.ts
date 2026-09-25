import { env } from "@server/env";
import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { createIncomingWebhookSchema } from "@server/lib/schemas";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";
import { integrationsRepo } from "@server/repo/integrations";
import { usersRepo } from "@server/repo/users";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  return json(await integrationsRepo.listIncoming(workspaceId));
});

export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const body = await parseBody(request, createIncomingWebhookSchema);

  const channel = await channelsRepo.get(body.channelId, user.id, workspaceId);
  if (!channel) return problem(404, "not_found", "Channel not found");

  const bot = await usersRepo.get(body.botUserId);
  if (!bot?.isBot) return problem(422, "not_a_bot", "Messages must be posted by a bot account");

  // The bot has to be in the channel, because posting is the same code path any
  // other author takes — there is no privileged write that skips membership.
  await channelsRepo.addMembers(body.channelId, [body.botUserId]);

  const created = await integrationsRepo.createIncoming({
    workspaceId,
    channelId: body.channelId,
    botUserId: body.botUserId,
    name: body.name,
    createdBy: user.id,
  });

  await audit({
    actorId: user.id,
    action: "integration.incoming_webhook_created",
    category: "channel",
    severity: "warning",
    target: `${body.name} -> #${channel.name}`,
    request,
  });

  // The URL *is* the credential, so it is returned once and never again.
  return json(
    { id: created.id, url: `${env.publicUrl}/api/v1/hooks/${created.secret}` },
    { status: 201 },
  );
});
