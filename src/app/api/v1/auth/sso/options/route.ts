import { handler, json } from "@server/lib/http";
import { ssoRepo } from "@server/repo/sso";

/**
 * What the sign-in page needs to know: whether to show a single sign-on button,
 * what to call it, and whether passwords are switched off. Public, so it says
 * nothing about the provider beyond its label.
 */
export const GET = handler(async (request: Request) => {
  const slug = new URL(request.url).searchParams.get("workspace");
  const workspace = await ssoRepo.loginWorkspace(slug);
  const config = workspace ? await ssoRepo.get(workspace.id) : null;
  if (!workspace || !config?.enabled) return json({ enabled: false, label: "", enforced: false });
  return json({ enabled: true, label: config.label, enforced: config.enforced });
});
