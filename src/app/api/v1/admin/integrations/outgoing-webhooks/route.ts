import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { assertSafeUrl, OutboundError } from "@server/lib/outbound";
import { createOutgoingWebhookSchema } from "@server/lib/schemas";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  return json(await integrationsRepo.listOutgoing(workspaceId));
});

export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const body = await parseBody(request, createOutgoingWebhookSchema);

  // Refused at save time so the administrator sees why, rather than the
  // delivery failing silently later. Re-checked at send time regardless.
  try {
    await assertSafeUrl(body.targetUrl);
  } catch (error) {
    if (error instanceof OutboundError) return problem(422, "unsafe_url", error.message);
    throw error;
  }

  const created = await integrationsRepo.createOutgoing({
    workspaceId,
    channelId: body.channelId,
    name: body.name,
    targetUrl: body.targetUrl,
    triggerWords: body.triggerWords,
    connectionId: body.connectionId,
    createdBy: user.id,
  });

  await audit({
    actorId: user.id,
    action: "integration.outgoing_webhook_created",
    category: "channel",
    severity: "warning",
    target: `${body.name} -> ${body.targetUrl}`,
    request,
  });

  // The receiver needs the signing secret to verify deliveries.
  return json({ id: created.id, signingSecret: created.signingSecret }, { status: 201 });
});
