import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg shadow-xs transition-colors",
        "placeholder:text-fg-subtle",
        "hover:border-border-strong",
        "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[color-mix(in_oklch,var(--accent)_35%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-invalid:border-danger aria-invalid:focus-visible:outline-[color-mix(in_oklch,var(--danger)_35%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}
