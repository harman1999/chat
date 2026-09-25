import { handler, json } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { messagesRepo } from "@server/repo/messages";

export const GET = handler(async () => {
  const { user } = await requireSession();
  return json(await messagesRepo.listSaved(user.id));
});
