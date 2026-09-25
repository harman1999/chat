"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminService } from "@/services";
import { formatRelative } from "@/lib/format";
import type { SystemCounter } from "@/types";

/** Groups counters by metric so each rule or action reads as one row. */
function rowsFor(counters: SystemCounter[], name: string) {
  return counters.filter((counter) => counter.name === name);
}

function sum(counters: SystemCounter[]) {
  return counters.reduce((total, counter) => total + counter.count, 0);
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/**
 * The two operational facts that are otherwise invisible: whether the rate
 * limiter is actually applying, and whether the audit trail is still being
 * written to. Both fail quietly by design — the limiter fails open so an
 * outage cannot take the API down, and an audit write that throws is swallowed
 * so it cannot roll back the action it describes.
 */
export function SystemHealth() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => adminService.health(),
    // Operational state, not reference data — a stale reading is misleading.
    refetchInterval: 30_000,
    staleTime: 0,
  });

  const degraded = data ? rowsFor(data.counters, "ratelimit.degraded") : [];
  const rejected = data ? rowsFor(data.counters, "ratelimit.rejected") : [];
  const auditFailures = data ? rowsFor(data.counters, "audit.failed") : [];
  const auditWrites = data ? rowsFor(data.counters, "audit.written") : [];

  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="flex-1 text-sm font-semibold text-fg">System health</h2>
        {data && (
          <span className="text-2xs text-fg-subtle">
            this process · up {formatUptime(data.uptimeSeconds)}
          </span>
        )}
      </header>

      {isPending ? (
        <div className="space-y-2.5 px-4 py-3" aria-hidden>
          <Skeleton className="h-3 w-48 rounded-full" />
          <Skeleton className="h-3 w-40 rounded-full" />
        </div>
      ) : isError || !data ? (
        <p className="px-4 py-3 text-xs text-fg-muted">Health could not be read.</p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            <li className="flex items-center gap-2.5 px-4 py-3">
              {data.rateLimitingEffective ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <ShieldOff className="size-4 shrink-0 text-danger" aria-hidden />
              )}
              <span className="min-w-0 flex-1 text-xs text-fg-muted">
                Rate limiting
                {data.rateLimitingEffective
                  ? " is applying"
                  : ` has failed open ${sum(degraded).toLocaleString()} times — Redis was unreachable`}
              </span>
              {/* The icon and the sentence both carry the state, so colour is
                  never the only thing saying whether this is good or bad. */}
              <Badge variant={data.rateLimitingEffective ? "success" : "danger"} size="sm">
                {data.rateLimitingEffective ? "Effective" : "Failing open"}
              </Badge>
            </li>

            <li className="flex items-center gap-2.5 px-4 py-3">
              {auditFailures.length === 0 ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
              )}
              <span className="min-w-0 flex-1 text-xs text-fg-muted">
                {auditFailures.length === 0
                  ? data.lastAuditAt
                    ? `Audit trail last written ${formatRelative(data.lastAuditAt)}`
                    : "Audit trail has no entries yet"
                  : `${sum(auditFailures).toLocaleString()} audit writes failed — the trail has gaps`}
              </span>
              {/* Scoped explicitly: a bare "0 written" beside "last written 2m
                  ago" reads as a contradiction rather than as two different
                  measurements. With nothing written since this process started
                  and nothing failing, the sentence already says everything. */}
              {(sum(auditWrites) > 0 || auditFailures.length > 0) && (
                <Badge variant={auditFailures.length === 0 ? "neutral" : "warning"} size="sm">
                  {sum(auditWrites).toLocaleString()} this process
                </Badge>
              )}
            </li>
          </ul>

          {rejected.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <h3 className="text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                Requests turned away
              </h3>
              <ul className="mt-2 space-y-1.5">
                {rejected.map((counter) => (
                  <li key={counter.label} className="flex items-baseline gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-muted">
                      {counter.label}
                    </span>
                    {/* Aligned in a column, so equal-width digits are right here. */}
                    <span className="tabular-nums text-fg">{counter.count.toLocaleString()}</span>
                    <time
                      dateTime={counter.lastAt}
                      className="w-16 shrink-0 text-right text-2xs text-fg-subtle"
                    >
                      {formatRelative(counter.lastAt)}
                    </time>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="border-t border-border px-4 py-2.5 text-2xs text-fg-subtle">
            Counters are per-process and reset on restart. The audit timestamp comes from the
            database, so it survives one.
          </p>
        </>
      )}
    </section>
  );
}
