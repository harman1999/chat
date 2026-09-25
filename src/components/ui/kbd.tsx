import { cn } from "@/lib/utils";

/** Keycap. Use for shortcut hints in tooltips, menus and the search field. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-surface-subtle px-1",
        "font-sans text-[0.6875rem] font-medium leading-none text-fg-subtle",
        className,
      )}
      {...props}
    />
  );
}
