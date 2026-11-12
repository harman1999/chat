import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Choose a new password",
  // The address carries the reset token; keep it out of any Referer header.
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthShell title="This link is incomplete" subtitle="Open the link from your email again, or ask for a new one.">
        <Button asChild variant="primary" size="lg" className="w-full">
          <Link href="/forgot-password">Send me a new link</Link>
        </Button>
      </AuthShell>
    );
  }
  return <ResetPasswordForm token={token} />;
}
