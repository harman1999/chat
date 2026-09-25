"use client";

import {
  Bell,
  FileClock,
  Hash,
  HardDrive,
  Blocks,
  KeyRound,
  LayoutDashboard,
  Server,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const ADMIN_SECTIONS: {
  href: string;
  label: string;
  icon: LucideIcon;
  group: string;
}[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { href: "/admin/users", label: "Users", icon: Users, group: "People" },
  { href: "/admin/roles", label: "Roles", icon: ShieldCheck, group: "People" },
  { href: "/admin/permissions", label: "Permissions", icon: KeyRound, group: "People" },
  { href: "/admin/channels", label: "Channels", icon: Hash, group: "Workspace" },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, group: "Workspace" },
  { href: "/admin/storage", label: "File storage", icon: HardDrive, group: "Workspace" },
  { href: "/admin/integrations", label: "Integrations", icon: Blocks, group: "Workspace" },
  { href: "/admin/authentication", label: "Authentication", icon: KeyRound, group: "Security" },
  { href: "/admin/audit-log", label: "Audit logs", icon: FileClock, group: "Security" },
  { href: "/admin/system", label: "System settings", icon: Server, group: "Security" },
];

const GROUPS = ["Overview", "People", "Workspace", "Security"];

export function AdminNav({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const pathname = usePathname();

  if (orientation === "horizontal") {
    return (
      <nav aria-label="Administration sections" className="flex gap-1 overflow-x-auto scrollbar-thin px-3 pb-2">
        {ADMIN_SECTIONS.map((section) => {
          const isActive = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-accent-subtle text-accent-subtle-fg"
                  : "text-fg-muted hover:bg-surface-hover hover:text-fg",
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Administration sections" className="space-y-4">
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1 px-2 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
            {group}
          </p>
          <div className="space-y-0.5">
            {ADMIN_SECTIONS.filter((section) => section.group === group).map((section) => {
              const Icon = section.icon;
              const isActive = pathname === section.href;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-accent-subtle font-medium text-accent-subtle-fg"
                      : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                  )}
                >
                  <Icon
                    className={cn("size-4 shrink-0", isActive ? "text-accent" : "text-fg-subtle")}
                    aria-hidden
                  />
                  <span className="truncate">{section.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
