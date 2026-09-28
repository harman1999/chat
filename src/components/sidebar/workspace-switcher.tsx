"use client";

import { Check, ChevronsUpDown, LogOut, Settings2, ShieldCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { usePermission } from "@/hooks";
import { authService } from "@/services";
import { APP } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store";
import type { Workspace } from "@/types";
import { InvitePeopleDialog } from "./invite-people-dialog";

const PLAN_LABEL: Record<Workspace["plan"], string> = {
  free: "Free",
  business: "Business",
  enterprise: "Enterprise",
};

export function WorkspaceSwitcher({
  workspaces,
  isCollapsed = false,
  variant = "sidebar",
}: {
  workspaces: Workspace[];
  isCollapsed?: boolean;
  /**
   * Where it sits. The sidebar keeps its own dark palette in both themes, while
   * the top bar uses the ordinary surface — so the same control needs the
   * colours of whichever it is on, or it reads as pasted in from elsewhere.
   */
  variant?: "sidebar" | "topbar";
}) {
  const onTopbar = variant === "topbar";
  const router = useRouter();
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const setWorkspace = useWorkspaceStore((state) => state.setWorkspace);
  const active = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0];
  // Only offered to people who can actually invite, rather than shown to
  // everyone and refused on click.
  const canInvite = usePermission("p_user_invite");
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // The list is fetched now, so it is briefly empty on first paint.
  if (!active) {
    return (
      <div
        className={cn(
          "flex w-full items-center",
          isCollapsed ? "h-9 justify-center px-0" : onTopbar ? "h-9 gap-2 px-1.5" : "h-11 gap-2.5 px-2",
        )}
      >
        <AppLogoMark className={cn(isCollapsed && "size-7")} />
        {!isCollapsed && (
          <span className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn("h-2.5 w-28 rounded-full", !onTopbar && "bg-sidebar-hover")} />
            <Skeleton className={cn("h-2 w-16 rounded-full", !onTopbar && "bg-sidebar-hover")} />
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Workspace: ${active.name}. Switch workspace`}
        className={cn(
          "flex w-full items-center rounded-md text-left transition-colors",
          onTopbar
            ? "hover:bg-surface-hover data-[state=open]:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            : "focus-sidebar hover:bg-sidebar-hover data-[state=open]:bg-sidebar-hover",
          // The top bar is 52px tall, so the control is shorter there.
          isCollapsed ? "h-9 justify-center px-0" : onTopbar ? "h-9 gap-2 px-1.5" : "h-11 gap-2.5 px-2",
        )}
      >
        <AppLogoMark className={cn(isCollapsed && "size-7")} />
        {!isCollapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-sm font-semibold leading-tight",
                  onTopbar ? "text-fg" : "text-sidebar-fg",
                )}
              >
                {active.name}
              </span>
              <span
                className={cn(
                  "block truncate text-2xs leading-tight",
                  onTopbar ? "text-fg-subtle" : "text-sidebar-subtle",
                )}
              >
                {APP.name} · {PLAN_LABEL[active.plan]}
              </span>
            </span>
            <ChevronsUpDown
              className={cn("size-3.5 shrink-0", onTopbar ? "text-fg-subtle" : "text-sidebar-subtle")}
              aria-hidden
            />
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

        {canInvite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setIsInviteOpen(true)}>
              <UserPlus />
              Invite people to {active.name}
            </DropdownMenuItem>
          </>
        )}

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
      <InvitePeopleDialog
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
        workspaceName={active.name}
      />
    </>
  );
}
