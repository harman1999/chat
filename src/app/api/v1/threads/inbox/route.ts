import { handler, json } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { threadsRepo } from "@server/repo/threads";

export const GET = handler(async () => {
  const { user, workspaceId } = await requireSession();
  return json(await threadsRepo.inbox(user.id, workspaceId));
});
