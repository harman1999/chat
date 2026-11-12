"use client";

import {
  Bell,
  CircleUserRound,
  Palette,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const SETTINGS_SECTIONS: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    href: "/settings/profile",
    label: "Profile",
    description: "Photo, name, email and password",
    icon: CircleUserRound,
  },
  {
    href: "/settings/appearance",
    label: "Appearance",
    description: "Theme and density",
    icon: Palette,
  },
  {
    href: "/settings/notifications",
    label: "Notifications",
    description: "Alerts and do not disturb",
    icon: Bell,
  },
  {
    href: "/settings/preferences",
    label: "Preferences",
    description: "Language and messages",
    icon: SlidersHorizontal,
  },
];

export function SettingsNav({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const pathname = usePathname();

  if (orientation === "horizontal") {
    return (
      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto scrollbar-thin px-3 py-2">
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-sidebar",
                isActive
                  ? "bg-sidebar-active text-sidebar-active-fg"
                  : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg",
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
    <nav aria-label="Settings sections" className="space-y-0.5">
      {SETTINGS_SECTIONS.map((section) => {
        const Icon = section.icon;
        const isActive = pathname === section.href;
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors focus-sidebar",
              isActive ? "bg-sidebar-active" : "hover:bg-sidebar-hover",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                isActive ? "text-sidebar-active-fg" : "text-sidebar-subtle",
              )}
              aria-hidden
            />
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-sm font-medium",
                  isActive ? "text-sidebar-active-fg" : "text-sidebar-fg",
                )}
              >
                {section.label}
              </span>
              <span className={cn("block truncate text-2xs", isActive ? "text-sidebar-muted" : "text-sidebar-subtle")}>
                {section.description}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
