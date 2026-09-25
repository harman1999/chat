"use client";

import { useQuery } from "@tanstack/react-query";
import { HardDrive, Hash, MessageSquare, ShieldCheck, ShieldOff, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { UserAvatar } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserMap } from "@/hooks";
import { adminService } from "@/services";
import { formatBytes, formatCompact, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuditSeverity } from "@/types";
import { AdminPage } from "./admin-page";
import { StatTile } from "./stat-tile";
import { SystemHealth } from "./system-health";
import { TrendChart } from "./trend-chart";

const RANGES = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
] as const;

const SEVERITY_VARIANT: Record<AuditSeverity, "neutral" | "warning" | "danger"> = {
  info: "neutral",
  warning: "warning",
  critical: "danger",
};

/** Percentage change between the first and second half of a series. */
function trendDelta(values: number[]): number | undefined {
  if (values.length < 4) return undefined;
  const midpoint = Math.floor(values.length / 2);
  const mean = (list: number[]) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const previous = mean(values.slice(0, midpoint));
  const current = mean(values.slice(midpoint));
  if (previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

export function DashboardAdmin() {
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>(30);

  const usersById = useUserMap();
  const statsQuery = useQuery({ queryKey: ["admin-stats"], queryFn: () => adminService.stats() });
  const activityQuery = useQuery({
    queryKey: ["admin-activity"],
    queryFn: () => adminService.activity(30),
  });
  const auditQuery = useQuery({ queryKey: ["admin-audit-log"], queryFn: () => adminService.auditLog() });
  const settingsQuery = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminService.settings(),
  });

  const series = useMemo(
    () => (activityQuery.data ?? []).slice(-range),
    [activityQuery.data, range],
  );

  const stats = statsQuery.data;
  const messagesDelta = trendDelta(series.map((point) => point.messages));
  const usersDelta = trendDelta(series.map((point) => point.activeUsers));

  return (
    <AdminPage
      title="Dashboard"
      description="Health and activity across Northwind Technologies."
      actions={
        <Button variant="secondary" size="sm" asChild>
          <Link href="/admin/audit-log">View audit log</Link>
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Members"
            value={(stats?.totalUsers ?? 0).toLocaleString()}
            hint={`${stats?.activeUsers7d.toLocaleString() ?? 0} active this week`}
            icon={Users}
            isPending={statsQuery.isPending}
          />
          <StatTile
            label="Messages today"
            value={(stats?.messages24h ?? 0).toLocaleString()}
            hint={`${formatCompact(stats?.messages30d ?? 0)} in 30 days`}
            icon={MessageSquare}
            isPending={statsQuery.isPending}
          />
          <StatTile
            label="Channels"
            value={(stats?.totalChannels ?? 0).toLocaleString()}
            hint={`${stats?.privateChannels ?? 0} private · ${stats?.archivedChannels ?? 0} archived`}
            icon={Hash}
            isPending={statsQuery.isPending}
          />
          <StatTile
            label="Storage"
            value={stats ? formatBytes(stats.storageUsedBytes) : "—"}
            hint={stats ? `of ${formatBytes(stats.storageQuotaBytes)}` : undefined}
            icon={HardDrive}
            isPending={statsQuery.isPending}
          />
        </div>

        {/* One filter row above everything it scopes — both charts re-render. */}
        <div className="flex items-center gap-2">
          <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">Activity</p>
          <div className="ml-auto flex items-center gap-1">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={range === option.value}
                onClick={() => setRange(option.value)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  range === option.value
                    ? "bg-accent-subtle text-accent-subtle-fg"
                    : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {activityQuery.isPending ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-56 rounded-lg" />
            <Skeleton className="h-56 rounded-lg" />
          </div>
        ) : (
          /* Two charts rather than one with two y-axes: messages and people are
             different scales, and a shared axis would imply a false correlation. */
          <div className="grid gap-3 lg:grid-cols-2">
            <TrendChart
              title="Messages per day"
              subtitle={
                messagesDelta !== undefined
                  ? `${messagesDelta > 0 ? "+" : ""}${messagesDelta.toFixed(1)}% vs the previous period`
                  : undefined
              }
              unit="messages"
              data={series.map((point) => ({ date: point.date, value: point.messages }))}
            />
            <TrendChart
              title="Active people per day"
              subtitle={
                usersDelta !== undefined
                  ? `${usersDelta > 0 ? "+" : ""}${usersDelta.toFixed(1)}% vs the previous period`
                  : undefined
              }
              unit="people"
              data={series.map((point) => ({ date: point.date, value: point.activeUsers }))}
            />
          </div>
        )}

        <div className="grid items-start gap-3 lg:grid-cols-3">
          <section className="rounded-lg border border-border bg-surface lg:col-span-2">
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <h2 className="flex-1 text-sm font-semibold text-fg">Recent administrative activity</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/audit-log">View all</Link>
              </Button>
            </header>
            <ul className="divide-y divide-border">
              {auditQuery.isPending
                ? [0, 1, 2, 3, 4].map((row) => (
                    <li key={row} className="flex items-center gap-2.5 px-4 py-2.5">
                      <Skeleton className="size-6 rounded-md" />
                      <Skeleton className="h-2.5 w-48 rounded-full" />
                    </li>
                  ))
                : auditQuery.data?.slice(0, 6).map((entry) => {
                    const actor = usersById[entry.actorId];
                    return (
                      <li key={entry.id} className="flex items-center gap-2.5 px-4 py-2.5">
                        {actor && <UserAvatar user={actor} size="sm" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-2xs text-fg">{entry.action}</p>
                          <p className="truncate text-2xs text-fg-subtle">{entry.target}</p>
                        </div>
                        <Badge variant={SEVERITY_VARIANT[entry.severity]} size="sm" className="capitalize">
                          {entry.severity}
                        </Badge>
                        <time
                          dateTime={entry.createdAt}
                          className="hidden w-20 shrink-0 text-right text-2xs text-fg-subtle sm:block"
                        >
                          {formatRelative(entry.createdAt)}
                        </time>
                      </li>
                    );
                  })}
            </ul>
          </section>

          <section className="rounded-lg border border-border bg-surface">
            <header className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-fg">Needs attention</h2>
            </header>
            <ul className="divide-y divide-border text-sm">
              {/* Read from settings rather than stated. The line used to be
                  static text, so it would have gone on claiming 2FA was
                  unenforced after someone enforced it. */}
              {settingsQuery.data && (
                <li className="flex items-center gap-2.5 px-4 py-3">
                  {settingsQuery.data.requireTwoFactor ? (
                    <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <ShieldOff className="size-4 shrink-0 text-warning" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 text-xs text-fg-muted">
                    Two-factor authentication is
                    {settingsQuery.data.requireTwoFactor ? " enforced" : " not enforced"}
                  </span>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/authentication">Review</Link>
                  </Button>
                </li>
              )}
              <li className="flex items-center gap-2.5 px-4 py-3">
                <Users className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                <span className="min-w-0 flex-1 text-xs text-fg-muted">
                  {stats?.pendingInvites ?? 0} invitations pending for over 7 days
                </span>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin/users">Review</Link>
                </Button>
              </li>
              {/* An uptime row used to sit here showing 99.98%, which was a
                  literal in the stats repo — this application does not measure
                  uptime, and inventing the number is worse than omitting it.
                  System health below reports what is actually known. */}
            </ul>
          </section>
        </div>

        <SystemHealth />
      </div>
    </AdminPage>
  );
}
