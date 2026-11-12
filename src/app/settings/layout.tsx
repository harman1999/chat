import Link from "next/link";
import { requirePage } from "@server/lib/guard";
import { AppLogoMark } from "@/components/common";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ShortcutsDialog } from "@/components/layout";
import { UserMenu } from "@/components/profile/user-menu";
import { APP } from "@/lib/constants";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requirePage();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <header className="sticky top-0 z-10 flex h-[var(--spacing-topbar)] shrink-0 items-center gap-2 border-b border-border px-3 topbar-dark sm:px-4">
        {/* The logo is the way home, as it is everywhere else. */}
        <Link href="/workspace" aria-label="Back to the chat" title="Back to the chat" className="shrink-0 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <AppLogoMark />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-fg">Settings</p>
          <p className="truncate text-2xs text-fg-subtle">{APP.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <UserMenu />
        </div>
      </header>

      {/* The section list, in the same colours as the workspace sidebar: a
          scrollable strip below lg, a full-height column from lg up. */}
      <div className="border-b border-sidebar-border bg-sidebar lg:hidden">
        <SettingsNav orientation="horizontal" />
      </div>

      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
          <div className="sticky top-[var(--spacing-topbar)] max-h-[calc(100dvh-var(--spacing-topbar))] overflow-y-auto px-2 py-4 scrollbar-sidebar">
            <SettingsNav />
          </div>
        </aside>
        <div className="min-w-0 flex-1 px-3 py-6 sm:px-6">
          <main className="mx-auto w-full max-w-3xl space-y-8 pb-12">{children}</main>
        </div>
      </div>

      {/* The profile menu's "Keyboard shortcuts" opens this; the chat screen mounts its own. */}
      <ShortcutsDialog />
    </div>
  );
}
