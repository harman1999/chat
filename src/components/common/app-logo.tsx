import type * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Helix mark — three offset strands. Drawn as inline SVG so it inherits colour
 * and stays crisp at every size.
 */
export function AppLogo({ className, title = "Helix" }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={title}
      className={cn("size-5", className)}
    >
      <path
        d="M6 3.5c0 4.2 12 4.6 12 8.5s-12 4.3-12 8.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M18 3.5c0 4.2-12 4.6-12 8.5s12 4.3 12 8.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

export function AppLogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg shadow-xs",
        className,
      )}
    >
      <AppLogo className="size-4" />
    </span>
  );
}

/**
 * A workspace's own logo, or — until one is uploaded, or if it fails to load —
 * whatever `fallback` is: the Helix mark on the switcher, initials in lists.
 */
export function WorkspaceLogo({
  logoUrl,
  name,
  className,
  fallback,
}: {
  logoUrl: string | null;
  name: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  if (!logoUrl) return <>{fallback}</>;
  return (
    <Avatar className={cn("size-7 bg-surface-raised shadow-xs", className)}>
      <AvatarImage src={logoUrl} alt={`${name} logo`} />
      <AvatarFallback className="bg-transparent">{fallback}</AvatarFallback>
    </Avatar>
  );
}
