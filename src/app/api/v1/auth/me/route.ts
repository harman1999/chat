import { handler, json } from "@server/lib/http";
import { requireSession } from "@server/lib/session";

export const GET = handler(async () => {
  const { user } = await requireSession();
  return json(user);
});
