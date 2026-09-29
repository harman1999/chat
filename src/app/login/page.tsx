import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@server/lib/session";
import { workspacesRepo } from "@server/repo/workspaces";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-origin paths: `next` comes from the URL, so it is caller-supplied. */
function safeNext(value: string | undefined): string {
  if (!value) return "/workspace";
  // A value starting with "//" is a protocol-relative URL to another host —
  // exactly the open redirect this check exists to prevent.
  if (!value.startsWith("/") || value.startsWith("//")) return "/workspace";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; workspace?: string }>;
}) {
  const { next, workspace } = await searchParams;
  const destination = safeNext(next);

  // Already signed in? Skip the form.
  if (await getSession()) redirect(destination);
  // A link can name the workspace (?workspace=slug) — the switcher does, after
  // signing out of one to sign in to another. Otherwise sign-in works it out
  // from the email.
  const named = workspace ? await workspacesRepo.bySlug(workspace) : null;
  return <LoginForm next={destination} workspace={named ?? undefined} />;
}
