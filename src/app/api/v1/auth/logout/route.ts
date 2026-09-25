import { cookies } from "next/headers";
import { env } from "@server/env";
import { handler, noContent } from "@server/lib/http";
import { destroySession, getSession } from "@server/lib/session";

export const POST = handler(async () => {
  const session = await getSession();
  if (session) await destroySession(session.sessionId);

  const store = await cookies();
  store.delete(env.sessionCookie);
  return noContent();
});
