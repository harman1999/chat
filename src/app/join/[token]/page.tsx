import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@server/lib/session";
import { JoinWorkspace } from "@/components/auth/join-workspace";

export const metadata: Metadata = { title: "Join workspace" };

/**
 * Where an invite link lands. Public: the person opening it has no account yet.
 * Someone already signed in has nothing to join, so they go straight in.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  if (await getSession()) redirect("/workspace");
  const { token } = await params;
  return <JoinWorkspace token={token} />;
}
