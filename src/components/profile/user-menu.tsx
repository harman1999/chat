"use client";

import {
  CircleUserRound,
  Keyboard,
  LogOut,
  MinusCircle,
  Moon,
  Settings,
  SlidersHorizontal,
  Circle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/common";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks";
import { PRESENCE_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store";
import { StatusControl } from "@/components/settings";
import type { PresenceStatus } from "@/types";

const PRESENCE_OPTIONS: { value: PresenceStatus; icon: typeof Circle; tone: string }[] = [
  { value: "online", icon: Circle, tone: "!text-presence-online" },
  { value: "away", icon: Moon, tone: "!text-presence-away" },
  { value: "dnd", icon: MinusCircle, tone: "!text-presence-dnd" },
  { value: "offline", icon: Circle, tone: "!text-presence-offline" },
];

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const setShortcutsOpen = useUIStore((state) => state.setShortcutsOpen);
  const { data: user } = useCurrentUser();

  if (!user) {
    return (
      <div className={cn("flex items-center", compact ? "size-8 justify-center" : "h-8 gap-2 pl-1 pr-2")}>
        <Skeleton className="size-6 rounded-[5px]" />
        {!compact && <Skeleton className="hidden h-2.5 w-20 rounded-full lg:block" />}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${user.displayName}, ${PRESENCE_LABEL[user.presence]}`}
        className={cn(
          "flex items-center rounded-md transition-colors hover:bg-surface-hover data-[state=open]:bg-surface-hover",
          compact ? "size-8 justify-center" : "h-8 gap-2 pl-1 pr-2",
        )}
      >
        <UserAvatar user={user} size="sm" showPresence />
        {!compact && (
          <span className="hidden min-w-0 text-left lg:block">
            <span className="block max-w-32 truncate text-xs font-semibold leading-tight text-fg">
              {user.displayName}
            </span>
            <span className="block text-[0.625rem] leading-tight text-fg-subtle">
              {PRESENCE_LABEL[user.presence]}
            </span>
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <UserAvatar user={user} size="lg" showPresence ringClassName="border-surface-raised" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">{user.displayName}</p>
            <p className="truncate text-xs text-fg-muted">{user.title}</p>
          </div>
        </div>

        {/* Status editing happens inline; selecting inside it must not close
            the menu, hence the stopPropagation wrapper. */}
        <div
          className="px-2 pb-2"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <StatusControl compact />
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Circle className={cn("!fill-current", `!text-presence-${user.presence}`)} />
            Availability
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {PRESENCE_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <DropdownMenuItem key={option.value}>
                  <Icon className={cn(option.tone, option.value !== "dnd" && "!fill-current")} />
                  {PRESENCE_LABEL[option.value]}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => router.push("/settings/profile")}>
          <CircleUserRound />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings/preferences")}>
          <SlidersHorizontal />
          Preferences
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
          <Keyboard />
          Keyboard shortcuts
          <DropdownMenuShortcut>⌘/</DropdownMenuShortcut>
        </DropdownMenuItem>


        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onSelect={() => router.push("/login")}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
