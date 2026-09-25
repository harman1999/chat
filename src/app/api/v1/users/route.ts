import { handler, json } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { usersRepo } from "@server/repo/users";

export const GET = handler(async () => {
  const { workspaceId } = await requireSession();
  return json(await usersRepo.list(workspaceId));
});
