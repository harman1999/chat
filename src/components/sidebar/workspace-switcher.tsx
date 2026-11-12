"use client";

import { ChevronsUpDown } from "lucide-react";
import { AppMenu } from "@/components/layout/app-menu";
import { AppLogoMark, WorkspaceLogo } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
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
  const workspaceId = useWorkspaceStore((state) => state.workspaceId);
  const active = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0];

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
      <AppMenu
        trigger={
      <button
        type="button"
        aria-label={`${active.name}. Open the menu`}
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
      </button>
        }
      />
    </>
  );
}
