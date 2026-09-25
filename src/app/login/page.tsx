import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@server/lib/session";
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
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next);

  // Already signed in? Skip the form.
  if (await getSession()) redirect(destination);
  return <LoginForm next={destination} />;
}
