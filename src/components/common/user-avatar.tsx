import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AVATAR_PALETTE } from "@/lib/constants";
import { initialsOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { User } from "@/types";
import { PresenceDot } from "./presence-dot";

const SIZES = {
  xs: { frame: "size-5", box: "size-5 rounded-[4px] text-[0.5625rem]", dot: "sm" },
  sm: { frame: "size-6", box: "size-6 rounded-[5px] text-[0.625rem]", dot: "sm" },
  md: { frame: "size-8", box: "size-8 rounded-md text-2xs", dot: "md" },
  lg: { frame: "size-9", box: "size-9 rounded-md text-xs", dot: "md" },
  xl: { frame: "size-14", box: "size-14 rounded-lg text-base", dot: "lg" },
} as const;

export function UserAvatar({
  user,
  size = "md",
  showPresence = false,
  ringClassName = "border-surface",
  className,
}: {
  user: Pick<User, "displayName" | "avatarUrl" | "avatarColor" | "presence" | "isBot">;
  size?: keyof typeof SIZES;
  showPresence?: boolean;
  ringClassName?: string;
  className?: string;
}) {
  const spec = SIZES[size];
  return (
    // The frame is sized explicitly: without it the wrapper stretches inside a
    // flex row and the presence dot detaches from the avatar's corner.
    <span className={cn("relative inline-flex shrink-0", spec.frame, className)}>
      <Avatar className={cn(spec.box)}>
        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
        <AvatarFallback className={cn(AVATAR_PALETTE[user.avatarColor % AVATAR_PALETTE.length])}>
          {initialsOf(user.displayName)}
        </AvatarFallback>
      </Avatar>
      {showPresence && (
        <PresenceDot
          status={user.presence}
          size={spec.dot}
          ringClassName={ringClassName}
          className="absolute -bottom-0.5 -right-0.5"
        />
      )}
    </span>
  );
}
