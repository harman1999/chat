"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Hash,
  Inbox,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppLogoMark, EmptyState, ErrorState, PresenceDot, UnreadBadge, UserAvatar } from "@/components/common";
import { ThemeToggle } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { users } from "@/data";
import { APP } from "@/lib/constants";
import type { PresenceStatus } from "@/types";

const SURFACE_TOKENS = [
  ["canvas", "bg-canvas"],
  ["surface", "bg-surface"],
  ["surface-subtle", "bg-surface-subtle"],
  ["surface-hover", "bg-surface-hover"],
  ["surface-active", "bg-surface-active"],
  ["sidebar", "bg-sidebar"],
] as const;

const ACCENT_TOKENS = [
  ["accent", "bg-accent"],
  ["accent-hover", "bg-accent-hover"],
  ["accent-subtle", "bg-accent-subtle"],
  ["success", "bg-success"],
  ["warning", "bg-warning"],
  ["danger", "bg-danger"],
] as const;

const TYPE_SCALE = [
  ["text-2xs", "11px · metadata, badges"],
  ["text-xs", "12px · secondary labels"],
  ["text-sm", "13px · UI default"],
  ["text-base", "14px · body copy"],
  ["text-md", "15px · panel titles"],
  ["text-lg", "17px · section headings"],
  ["text-xl", "20px · page titles"],
] as const;

const PRESENCES: PresenceStatus[] = ["online", "away", "dnd", "offline"];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border py-8 last:border-b-0">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-fg-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="sticky top-0 z-10 flex h-[var(--spacing-topbar)] items-center gap-2 border-b border-border bg-surface px-4">
        <AppLogoMark />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-fg">{APP.name} design system</p>
          <p className="truncate text-2xs text-fg-subtle">Phase 1 foundation</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button variant="secondary" size="sm" asChild>
            <Link href="/workspace">
              <ArrowLeft />
              Workspace
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
        <Section title="Colour tokens" hint="Every component consumes these; no component hardcodes a colour.">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {SURFACE_TOKENS.map(([name, className]) => (
                <div key={name} className="overflow-hidden rounded-md border border-border">
                  <div className={`h-12 ${className}`} />
                  <p className="border-t border-border bg-surface px-2 py-1.5 font-mono text-[0.625rem] text-fg-muted">
                    {name}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {ACCENT_TOKENS.map(([name, className]) => (
                <div key={name} className="overflow-hidden rounded-md border border-border">
                  <div className={`h-12 ${className}`} />
                  <p className="border-t border-border bg-surface px-2 py-1.5 font-mono text-[0.625rem] text-fg-muted">
                    {name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Typography" hint="A tight scale tuned for information density.">
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface px-4">
            {TYPE_SCALE.map(([token, usage]) => (
              <li key={token} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                <span className={`${token} font-medium text-fg`}>The quick brown fox jumps</span>
                <span className="font-mono text-[0.625rem] text-fg-subtle">{token} — {usage}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Buttons" hint="Four sizes, seven variants. Hover, active, focus and disabled are defined once.">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-4">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="subtle">Subtle</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="link">Link</Button>
            <Button variant="primary" disabled>Disabled</Button>
            <Button variant="secondary" size="icon-md" aria-label="Add">
              <Plus />
            </Button>
            <Button variant="ghost" size="icon-md" aria-label="Attach">
              <Paperclip />
            </Button>
          </div>
        </Section>

        <Section title="Identity and presence" hint="Presence encodes shape as well as colour.">
          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              {users.slice(0, 5).map((user) => (
                <UserAvatar key={user.id} user={user} size="md" showPresence />
              ))}
            </div>
            <div className="flex items-center gap-3">
              {PRESENCES.map((presence) => (
                <span key={presence} className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <PresenceDot status={presence} showLabel />
                  {presence}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="accent">Admin</Badge>
              <Badge variant="accent-subtle">Beta</Badge>
              <Badge variant="success">Healthy</Badge>
              <Badge variant="warning">Degraded</Badge>
              <Badge variant="outline">Guest</Badge>
              <UnreadBadge count={12} />
              <UnreadBadge count={7} tone="unread" className="!text-fg-muted" />
            </div>
          </div>
        </Section>

        <Section title="Form controls and keys">
          <div className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ds-channel">Channel name</Label>
              <Input id="ds-channel" placeholder="e.g. platform-oncall" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-invalid">With validation error</Label>
              <Input id="ds-invalid" aria-invalid defaultValue="general " />
              <p className="flex items-center gap-1 text-2xs text-danger">
                <AlertTriangle className="size-3" /> Names cannot contain spaces.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <Label htmlFor="ds-switch">Desktop notifications</Label>
              <Switch id="ds-switch" defaultChecked />
            </div>
            <div className="flex items-center gap-1.5 sm:col-span-2">
              <Kbd>⌘</Kbd><Kbd>K</Kbd>
              <span className="text-xs text-fg-subtle">Search</span>
              <span className="mx-2 h-4 w-px bg-border" />
              <Kbd>⇧</Kbd><Kbd>Enter</Kbd>
              <span className="text-xs text-fg-subtle">New line</span>
            </div>
          </div>
        </Section>

        <Section title="Feedback states" hint="Empty, loading and error states are shared components, not per-screen copy.">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface">
              <EmptyState
                icon={Inbox}
                title="You're all caught up"
                description="New mentions will appear here."
                compact
                action={<Button size="sm" variant="secondary">Browse channels</Button>}
              />
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-2.5">
                  <Skeleton className="size-8 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-2.5 w-24 rounded-full" />
                    <Skeleton className="h-2.5 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-surface">
              <ErrorState
                description="The channel list could not be loaded."
                onRetry={() => toast.success("Retried", { description: "Channels reloaded." })}
              />
            </div>
          </div>
        </Section>

        <Section title="Toasts">
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast.success("Message pinned", { description: "Visible to everyone in #general." })}
            >
              Success
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => toast.error("Upload failed", { description: "report.pdf exceeds the 50 MB limit." })}
            >
              Error
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                toast("Message deleted", {
                  description: "It has been removed for everyone.",
                  action: { label: "Undo", onClick: () => toast.success("Restored") },
                  icon: <Trash2 className="size-4" />,
                })
              }
            >
              With action
            </Button>
          </div>
        </Section>

        <Section title="Sidebar surface" hint="The workspace sidebar keeps its own dark token set in both themes.">
          <div className="max-w-64 overflow-hidden rounded-lg border border-sidebar-border bg-sidebar p-2">
            <div className="space-y-px">
              <div className="flex h-7 items-center gap-2 rounded-md bg-sidebar-active px-2 text-sm font-semibold text-sidebar-active-fg">
                <Hash className="size-4" /> general
              </div>
              <div className="flex h-7 items-center gap-2 rounded-md px-2 text-sm font-semibold text-sidebar-fg">
                <Hash className="size-4 text-sidebar-muted" /> devops
                <UnreadBadge count={2} className="ml-auto" />
              </div>
              <div className="flex h-7 items-center gap-2 rounded-md bg-sidebar-hover px-2 text-sm text-sidebar-fg">
                <Hash className="size-4 text-sidebar-muted" /> backend
                <span className="ml-auto text-2xs font-semibold text-sidebar-muted">3</span>
              </div>
              <div className="flex h-7 items-center gap-2 rounded-md px-2 text-sm text-sidebar-muted">
                <Hash className="size-4 text-sidebar-subtle" /> random
              </div>
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}
