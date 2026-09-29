import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage } from "@server/lib/guard";
import { hasAnyPermission } from "@server/lib/permissions";
import { roleNameOf } from "@server/repo/roles";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { workspacesRepo } from "@server/repo/workspaces";
import { AppLogoMark, WorkspaceLogo } from "@/components/common";
import { ThemeToggle } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
      <header className="sticky top-0 z-10 flex h-[var(--spacing-topbar)] shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:px-4">
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

      <div className="border-b border-border bg-surface lg:hidden">
        <AdminNav orientation="horizontal" />
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-3 py-6 sm:px-6">
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-[calc(var(--spacing-topbar)+1.5rem)]">
            <AdminNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-12">{children}</main>
      </div>
    </div>
  );
}
