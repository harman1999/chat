import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { createBotSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  return json(await integrationsRepo.listBots(workspaceId));
});

export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  await requirePermission(user.id, "p_admin_settings");
  const body = await parseBody(request, createBotSchema);

  const result = await integrationsRepo.createBot({ workspaceId, createdBy: user.id, ...body });
  if ("error" in result) {
    return problem(409, "username_taken", `The username @${body.username} is taken`);
  }

  await audit({
    actorId: user.id,
    action: "integration.bot_created",
    category: "user",
    severity: "warning",
    target: `@${body.username}`,
    request,
  });

  // The only time the token exists in plaintext anywhere.
  return json({ bot: result.bot, token: result.token }, { status: 201 });
});
