"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DialogOverlay } from "./dialog";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const sheetVariants = cva(
  "fixed z-50 flex flex-col bg-surface shadow-panel transition ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-250",
  {
    variants: {
      side: {
        left: "inset-y-0 left-0 h-full w-[min(19rem,85vw)] border-r border-border data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
        right:
          "inset-y-0 right-0 h-full w-[min(22rem,90vw)] border-l border-border data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
        bottom:
          "inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl border-t border-border data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
      },
    },
    defaultVariants: { side: "right" },
  },
);

export function SheetContent({
  className,
  side,
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof sheetVariants> & { showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        {showClose && (
          <DialogPrimitive.Close
            aria-label="Close panel"
            className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;
