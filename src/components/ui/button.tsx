"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow] duration-150 outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg shadow-xs hover:bg-accent-hover active:bg-accent-press",
        secondary:
          "border border-border bg-surface text-fg shadow-xs hover:bg-surface-hover hover:border-border-strong active:bg-surface-active",
        ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg active:bg-surface-active",
        subtle: "bg-surface-subtle text-fg hover:bg-surface-hover active:bg-surface-active",
        danger: "bg-danger text-white shadow-xs hover:bg-danger-hover",
        "danger-ghost": "text-danger hover:bg-danger-subtle",
        link: "text-accent underline-offset-4 hover:underline",
        sidebar:
          "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg focus-sidebar active:bg-sidebar-hover",
      },
      size: {
        xs: "h-6 px-2 text-2xs [&_svg]:size-3.5",
        sm: "h-7 px-2.5 text-xs [&_svg]:size-4",
        md: "h-8 px-3 text-sm [&_svg]:size-4",
        lg: "h-9 px-4 text-base [&_svg]:size-4",
        "icon-xs": "size-6 [&_svg]:size-3.5",
        "icon-sm": "size-7 [&_svg]:size-4",
        "icon-md": "size-8 [&_svg]:size-4",
        "icon-lg": "size-9 [&_svg]:size-[18px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
