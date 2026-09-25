"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The frame every integration list shares: a heading, an explanation of what
 * the thing actually does, the list, and a form to add one.
 *
 * The explanation is not decoration. Each of these hands out a credential or
 * makes this server call somewhere, and an administrator configuring one should
 * not have to infer the consequence from the field names.
 */
export function IntegrationPanel({
  title,
  description,
  isPending,
  isEmpty,
  emptyText,
  children,
  form,
}: {
  title: string;
  description: string;
  isPending: boolean;
  isEmpty: boolean;
  emptyText: string;
  children: ReactNode;
  form: ReactNode;
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_20rem]">
      <section className="rounded-lg border border-border bg-surface">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <p className="mt-0.5 text-2xs text-fg-subtle">{description}</p>
        </header>

        {isPending ? (
          <div className="space-y-2 px-4 py-3" aria-hidden>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-8 rounded-md" />
            ))}
          </div>
        ) : isEmpty ? (
          <p className="px-4 py-8 text-center text-xs text-fg-subtle">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-border">{children}</ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <header className="flex items-center gap-1.5 border-b border-border px-4 py-3">
          <Plus className="size-3.5 text-fg-subtle" aria-hidden />
          <h2 className="text-sm font-semibold text-fg">Add</h2>
        </header>
        <div className="px-4 py-3">{form}</div>
      </section>
    </div>
  );
}

/** A labelled input, since every one of these forms is a stack of them. */
export function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
      {hint && <p className="text-2xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

/** One row in an integration list. */
export function Row({
  title,
  subtitle,
  meta,
  actions,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-fg">{title}</p>
        <p className="truncate text-2xs text-fg-subtle">{subtitle}</p>
      </div>
      {meta}
      {actions}
    </li>
  );
}
