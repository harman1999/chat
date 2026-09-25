import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@server/lib/session";
import { OAuthConsent } from "@/components/auth/oauth-consent";

export const metadata: Metadata = { title: "Authorize application" };

/**
 * Where a third-party application sends someone to approve access.
 *
 * The API returns the consent details as data; this is the screen that turns
 * them into a decision. Without it the authorization endpoint answers a browser
 * with raw JSON and no way to approve — the protocol half without the human
 * half.
 */
export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Signing in must return here rather than to the workspace, or the
  // application's request is lost and the person has to start over.
  if (!(await getSession())) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      if (typeof value === "string") params.set(key, value);
    }
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${params}`)}`);
  }

  return <OAuthConsent />;
}
