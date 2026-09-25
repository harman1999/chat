import { handler, json } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { integrationsRepo } from "@server/repo/integrations";

/** The commands the composer offers. Enabled ones only. */
export const GET = handler(async () => {
  const { workspaceId } = await requireSession();
  const all = await integrationsRepo.listCommands(workspaceId);
  return json(all.filter((command) => command.isEnabled));
});
