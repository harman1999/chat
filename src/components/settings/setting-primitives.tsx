"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** A titled group of related settings. */
export function SettingSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border pb-8 last:border-b-0 last:pb-0", className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-md font-semibold tracking-tight text-fg">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="space-y-px overflow-hidden rounded-lg border border-border bg-surface">
        {children}
      </div>
    </section>
  );
}

/**
 * One setting: label and explanation on the left, control on the right.
 * Stacks on narrow screens rather than squeezing the control.
 */
export function SettingRow({
  label,
  description,
  htmlFor,
  control,
  children,
  className,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  /** Right-aligned control for simple rows. */
  control?: React.ReactNode;
  /** Full-width content below the label, for richer rows. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border p-3.5 last:border-b-0 sm:px-4", className)}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={htmlFor}
            className={cn("block text-sm font-medium text-fg", htmlFor && "cursor-pointer")}
          >
            {label}
          </label>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{description}</p>
          )}
        </div>
        {control && <div className="shrink-0 sm:ml-auto">{control}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Segmented control used for theme, density and notification levels. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex rounded-md border border-border bg-surface-subtle p-0.5", className)}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-surface text-fg shadow-xs"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Native select, themed to match the rest of the form controls. */
export function SettingSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 min-w-44 rounded-md border border-border bg-surface px-2 text-sm text-fg shadow-xs transition-colors",
        "hover:border-border-strong focus-visible:border-accent",
        className,
      )}
      {...props}
    />
  );
}
