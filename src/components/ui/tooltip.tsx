"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-60 rounded-md bg-[oklch(0.24_0.02_265)] px-2 py-1 text-2xs font-medium text-white shadow-md",
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export interface HintProps extends React.ComponentProps<typeof TooltipTrigger> {
  label: string;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Convenience wrapper — label plus optional shortcut hint.
 *
 * Props and ref are forwarded to the trigger so a hinted element can still be
 * composed into another `asChild` trigger (e.g. a dropdown menu).
 */
export const Hint = React.forwardRef<HTMLButtonElement, HintProps>(function Hint(
  { label, shortcut, side = "bottom", children, ...triggerProps },
  ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild ref={ref} {...triggerProps}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>
        <span>{label}</span>
        {shortcut && <span className="ml-1.5 text-white/55 tabular-nums">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
});
