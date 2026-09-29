"use client";

import { ChevronsUpDown, LogOut, Settings2, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppLogoMark, WorkspaceLogo } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanAdminister, usePermission } from "@/hooks";
import { authService } from "@/services";
import { APP } from "@/lib/constants";
import { reloadAs } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { formatMembers } from "@/lib/format";
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
  const active = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0];
  const canManageTeams = usePermission("p_team_manage");
  const canAdminister = useCanAdminister();
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
        <WorkspaceLogo
          logoUrl={active.logoUrl}
          name={active.name}
          fallback={<AppLogoMark className={cn(isCollapsed && "size-7")} />}
        />
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
        {/* One fixed workspace: shown as the header of the menu, not as a list to pick from. */}
        <div className="flex items-center gap-2.5 px-2 py-2">
          <WorkspaceLogo
            logoUrl={active.logoUrl}
            name={active.name}
            fallback={
              <span
                className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-2xs font-bold text-accent-fg"
                aria-hidden
              >
                {active.initials}
              </span>
            }
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-fg">{active.name}</span>
            <span className="block truncate text-2xs text-fg-subtle">
              {formatMembers(active.memberCount)} · {PLAN_LABEL[active.plan]}
            </span>
          </span>
        </div>

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
        {canManageTeams && (
          <DropdownMenuItem onSelect={() => router.push("/admin/teams")}>
            <UsersRound />
            Teams
          </DropdownMenuItem>
        )}
        {canAdminister && (
          <DropdownMenuItem onSelect={() => router.push("/admin")}>
            <ShieldCheck />
            Administration
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="danger"
          onSelect={async () => {
            await authService.signOut();
            reloadAs("/login");
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
