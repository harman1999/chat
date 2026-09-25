"use client";

import {
  Bell,
  CircleUserRound,
  KeyRound,
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
    description: "Name, role and status",
    icon: CircleUserRound,
  },
  {
    href: "/settings/account",
    label: "Account",
    description: "Email, password and sessions",
    icon: KeyRound,
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
      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto scrollbar-thin px-3 pb-2">
        {SETTINGS_SECTIONS.map((section) => {
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
              "flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors",
              isActive ? "bg-accent-subtle" : "hover:bg-surface-hover",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                isActive ? "text-accent" : "text-fg-subtle",
              )}
              aria-hidden
            />
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-sm font-medium",
                  isActive ? "text-accent-subtle-fg" : "text-fg",
                )}
              >
                {section.label}
              </span>
              <span className="block truncate text-2xs text-fg-subtle">{section.description}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
