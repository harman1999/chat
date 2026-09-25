import { redirect } from "next/navigation";
import { getSession, type SessionContext } from "./session";

/**
 * Page-level guard. Every API route authorises independently — this only keeps
 * signed-out visitors from landing on an empty shell.
 */
export async function requirePage(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
