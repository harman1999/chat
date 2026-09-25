"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hint } from "@/components/ui/tooltip";
import { useNotifications } from "@/hooks";
import { formatCount } from "@/lib/format";
import { NotificationsPanel } from "./notifications-panel";

export function NotificationsButton() {
  const { unreadCount } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Hint label="Notifications">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-md"
            className="relative"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          >
            <Bell />
            {unreadCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.5625rem] font-bold leading-none text-accent-fg ring-2 ring-surface"
                aria-hidden
              >
                {formatCount(unreadCount, 9)}
              </span>
            )}
          </Button>
        </PopoverTrigger>
      </Hint>

      <PopoverContent align="end" className="w-auto p-0">
        <NotificationsPanel onClose={() => setIsOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
