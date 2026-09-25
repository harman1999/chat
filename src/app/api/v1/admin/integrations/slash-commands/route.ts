import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { assertSafeUrl, OutboundError } from "@server/lib/outbound";
import { createSlashCommandSchema } from "@server/lib/schemas";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  return json(await integrationsRepo.listCommands(workspaceId));
});

export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const body = await parseBody(request, createSlashCommandSchema);

  try {
    await assertSafeUrl(body.targetUrl);
  } catch (error) {
    if (error instanceof OutboundError) return problem(422, "unsafe_url", error.message);
    throw error;
  }

  const result = await integrationsRepo.createCommand({
    workspaceId, createdBy: user.id, ...body,
  });
  if ("error" in result) {
    return problem(409, "command_taken", `/${body.command} is already registered`);
  }

  await audit({
    actorId: user.id,
    action: "integration.slash_command_created",
    category: "system",
    severity: "warning",
    target: `/${body.command} -> ${body.targetUrl}`,
    request,
  });
  return json({ id: result.id, signingSecret: result.signingSecret }, { status: 201 });
});
