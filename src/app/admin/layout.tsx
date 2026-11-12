import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage } from "@server/lib/guard";
import { hasAnyPermission } from "@server/lib/permissions";
import { roleNameOf } from "@server/repo/roles";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import { ShieldCheck } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { workspacesRepo } from "@server/repo/workspaces";
import { AppLogoMark, WorkspaceLogo } from "@/components/common";
import { ShortcutsDialog } from "@/components/layout";
import { UserMenu } from "@/components/profile/user-menu";
import { Badge } from "@/components/ui/badge";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, workspaceId } = await requirePage();
  // Every API behind these pages already refuses non-administrators; this keeps
  // them from being shown an admin shell full of errors.
  if (!(await hasAnyPermission(user.id, ADMIN_PERMISSIONS))) redirect("/workspace");
  const [workspace, roleName] = await Promise.all([
    workspacesRepo.identity(workspaceId),
    roleNameOf(user.id),
  ]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <header className="sticky top-0 z-10 flex h-[var(--spacing-topbar)] shrink-0 items-center gap-2 border-b border-border px-3 topbar-dark sm:px-4">
        {/* The logo is the way home, as it is everywhere else. */}
        <Link href="/workspace" aria-label="Back to the chat" title="Back to the chat" className="shrink-0 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <WorkspaceLogo
            logoUrl={workspace?.logoUrl ?? null}
            name={workspace?.name ?? ""}
            fallback={<AppLogoMark />}
          />
        </Link>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold tracking-tight text-fg">
            Administration
            <Badge variant="accent-subtle" size="sm" className="gap-1">
              <ShieldCheck className="size-2.5" aria-hidden />
              {roleName ?? "Admin"}
            </Badge>
          </p>
          <p className="truncate text-2xs text-fg-subtle">{workspace?.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <UserMenu />
        </div>
      </header>

      {/* The section list, in the same colours as the workspace sidebar: a strip
          below lg, a full-height column from lg up. */}
      <div className="border-b border-sidebar-border bg-sidebar lg:hidden">
        <AdminNav orientation="horizontal" />
      </div>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
          <div className="sticky top-[var(--spacing-topbar)] max-h-[calc(100dvh-var(--spacing-topbar))] overflow-y-auto px-2 py-4 scrollbar-sidebar">
            <AdminNav />
          </div>
        </aside>
        <div className="min-w-0 flex-1 px-3 py-6 sm:px-6">
          <main className="mx-auto w-full max-w-6xl pb-12">{children}</main>
        </div>
      </div>

      {/* The profile menu's "Keyboard shortcuts" opens this; the chat screen mounts its own. */}
      <ShortcutsDialog />
    </div>
  );
}
