import Link from "next/link";
import { requirePage } from "@server/lib/guard";
import { ArrowLeft } from "lucide-react";
import { AppLogoMark } from "@/components/common";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ThemeToggle } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { APP } from "@/lib/constants";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePage();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <header className="sticky top-0 z-10 flex h-[var(--spacing-topbar)] shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
        <AppLogoMark />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-fg">Settings</p>
          <p className="truncate text-2xs text-fg-subtle">{APP.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button variant="secondary" size="sm" asChild>
            <Link href="/workspace">
              <ArrowLeft />
              <span className="hidden sm:inline">Back to workspace</span>
              <span className="sm:hidden">Back</span>
            </Link>
          </Button>
        </div>
      </header>

      {/* Section list becomes a scrollable tab strip below lg. */}
      <div className="border-b border-border bg-surface lg:hidden">
        <SettingsNav orientation="horizontal" />
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-3 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-[calc(var(--spacing-topbar)+1.5rem)]">
            <SettingsNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1 space-y-8 pb-12">{children}</main>
      </div>
    </div>
  );
}
