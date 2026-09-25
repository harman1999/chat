import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { AppLogoMark, EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { APP } from "@/lib/constants";

/** Stand-in for a route whose build phase has not started yet. */
export function PhasePlaceholder({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <header className="flex h-[var(--spacing-topbar)] shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <AppLogoMark />
        <span className="text-sm font-semibold tracking-tight text-fg">{APP.name}</span>
        <Button variant="ghost" size="sm" asChild className="ml-auto">
          <Link href="/workspace">
            <ArrowLeft />
            Back to workspace
          </Link>
        </Button>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <EmptyState icon={icon} title={title} description={description} />
      </main>
    </div>
  );
}
