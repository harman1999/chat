import { cn } from "@/lib/utils";
import { PRESENCE_LABEL } from "@/lib/constants";
import type { PresenceStatus } from "@/types";

const SIZES = {
  sm: "size-2 border-[1.5px]",
  md: "size-2.5 border-2",
  lg: "size-3 border-2",
} as const;

const TONE: Record<PresenceStatus, string> = {
  online: "bg-presence-online",
  away: "bg-presence-away",
  dnd: "bg-presence-dnd",
  offline: "bg-transparent",
};

/**
 * Presence is encoded with shape as well as colour so it stays readable for
 * colour-blind users: offline is a hollow ring, dnd carries a bar.
 */
export function PresenceDot({
  status,
  size = "md",
  ringClassName = "border-surface",
  className,
  showLabel = false,
}: {
  status: PresenceStatus;
  size?: keyof typeof SIZES;
  ringClassName?: string;
  className?: string;
  showLabel?: boolean;
}) {
  return (
    <span
      role={showLabel ? "img" : undefined}
      aria-label={showLabel ? PRESENCE_LABEL[status] : undefined}
      aria-hidden={showLabel ? undefined : true}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full",
        SIZES[size],
        ringClassName,
        TONE[status],
        status === "offline" && "border-presence-offline",
        className,
      )}
    >
      {status === "dnd" && (
        <span className="h-[1.5px] w-[55%] rounded-full bg-white/95" />
      )}
    </span>
  );
}
