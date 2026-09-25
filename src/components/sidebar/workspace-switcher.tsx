"use client";

import { Check, ChevronsUpDown, LogOut, Settings2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { AppLogoMark } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { authService } from "@/services";
import { APP } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store";
import type { Workspace } from "@/types";

const PLAN_LABEL: Record<Workspace["plan"], string> = {
  free: "Free",
  business: "Business",
  enterprise: "Enterprise",
};

export function WorkspaceSwitcher({
  workspaces,
  isCollapsed = false,
}: {
  workspaces: Workspace[];
  isCollapsed?: boolean;
}) {
  const router = useRouter();
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const active = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0];

  // The list is fetched now, so it is briefly empty on first paint.
  if (!active) {
    return (
      <div
        className={cn(
          "flex w-full items-center",
          isCollapsed ? "h-9 justify-center px-0" : "h-11 gap-2.5 px-2",
        )}
      >
        <AppLogoMark className={cn(isCollapsed && "size-7")} />
        {!isCollapsed && (
          <span className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-2.5 w-28 rounded-full bg-sidebar-hover" />
            <Skeleton className="h-2 w-16 rounded-full bg-sidebar-hover" />
          </span>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Workspace: ${active.name}. Switch workspace`}
        className={cn(
          "flex w-full items-center rounded-md text-left transition-colors focus-sidebar",
          "hover:bg-sidebar-hover data-[state=open]:bg-sidebar-hover",
          isCollapsed ? "h-9 justify-center px-0" : "h-11 gap-2.5 px-2",
        )}
      >
        <AppLogoMark className={cn(isCollapsed && "size-7")} />
        {!isCollapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold leading-tight text-sidebar-fg">
                {active.name}
              </span>
              <span className="block truncate text-2xs leading-tight text-sidebar-subtle">
                {APP.name} · {PLAN_LABEL[active.plan]}
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-subtle" aria-hidden />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72" sideOffset={4}>
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((workspace) => {
          const isActive = workspace.id === active.id;
          return (
            <DropdownMenuItem
              key={workspace.id}
              onSelect={() => setWorkspace(workspace.id)}
              className="gap-2.5 py-2"
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-md text-2xs font-bold",
                  isActive ? "bg-accent text-accent-fg" : "bg-surface-active text-fg-muted",
                )}
                aria-hidden
              >
                {workspace.initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{workspace.name}</span>
                <span className="block truncate text-2xs text-fg-subtle">
                  {workspace.memberCount.toLocaleString()} members · {PLAN_LABEL[workspace.plan]}
                </span>
              </span>
              {workspace.mentionCount > 0 && !isActive && (
                <Badge variant="accent" size="sm" className="tabular-nums">
                  {workspace.mentionCount}
                </Badge>
              )}
              {isActive && <Check className="size-4 shrink-0 !text-accent" />}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Settings2 />
          Workspace settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/admin")}>
          <ShieldCheck />
          Administration
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="danger"
          onSelect={async () => {
            await authService.signOut();
            // Full navigation so server components re-read the cleared cookie.
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut />
          Sign out of {active.name}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
