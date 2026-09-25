import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-semibold leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-surface-active text-fg-muted",
        accent: "bg-accent text-accent-fg",
        "accent-subtle": "bg-accent-subtle text-accent-subtle-fg",
        success: "bg-success-subtle text-success",
        warning: "bg-warning-subtle text-warning",
        danger: "bg-danger text-white",
        outline: "border border-border text-fg-muted",
      },
      size: {
        sm: "h-4 px-1.5 text-[0.625rem]",
        md: "h-5 px-2 text-2xs",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
);

export function Badge({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };
