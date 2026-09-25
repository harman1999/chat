"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Native overflow container with themed slim scrollbars. Native scrolling is
 * deliberate — it keeps virtualised message lists and scroll anchoring simple.
 */
export function ScrollArea({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "sidebar" }) {
  return (
    <div
      className={cn(
        "scrollbar-thin overflow-y-auto overscroll-contain",
        variant === "sidebar" && "scrollbar-sidebar",
        className,
      )}
      {...props}
    />
  );
}
