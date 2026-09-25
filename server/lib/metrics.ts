/**
 * A tiny in-process counter registry.
 *
 * In-process on purpose. The first thing these counters have to be able to
 * report is "Redis is unreachable, so the rate limiter is failing open" — a
 * metric stored in Redis could not be written at the moment it mattered most.
 *
 * The trade-off is that counts are per-process and reset on restart, so they
 * answer "what is happening now" rather than "what happened last Tuesday".
 * Behind more than one instance, scrape each one; for durable history, ship
 * these to a real metrics backend. The audit trail, which does need to be
 * durable and complete, lives in Postgres instead.
 */

export type MetricName =
  | "ratelimit.allowed"
  | "ratelimit.rejected"
  | "ratelimit.degraded"
  | "audit.written"
  | "audit.failed"
  | "webhook.delivered"
  | "webhook.failed";

export interface Counter {
  name: MetricName;
  /** Distinguishes series within a metric — a rule name, an action. */
  label: string;
  count: number;
  firstAt: string;
  lastAt: string;
}

/** name -> label -> counter, so a label may contain any character. */
const counters = new Map<MetricName, Map<string, Counter>>();
const startedAt = new Date().toISOString();

export function increment(name: MetricName, label = "-", by = 1): void {
  const series = counters.get(name) ?? new Map<string, Counter>();
  counters.set(name, series);

  const now = new Date().toISOString();
  const existing = series.get(label);
  if (existing) {
    existing.count += by;
    existing.lastAt = now;
    return;
  }
  series.set(label, { name, label, count: by, firstAt: now, lastAt: now });
}

export interface MetricsSnapshot {
  /** When this process started counting. */
  startedAt: string;
  uptimeSeconds: number;
  counters: Counter[];
}

export function snapshot(): MetricsSnapshot {
  const flat = [...counters.values()].flatMap((series) => [...series.values()]);
  return {
    startedAt,
    uptimeSeconds: Math.round((Date.now() - Date.parse(startedAt)) / 1000),
    counters: flat.sort(
      (a, b) => a.name.localeCompare(b.name) || a.label.localeCompare(b.label),
    ),
  };
}

/** Test-only: counters are global, so a suite asserting on them must start clean. */
export function resetMetrics(): void {
  counters.clear();
}

/**
 * Logs at most once per interval per key.
 *
 * A Redis outage means every request takes the degraded path; logging each one
 * turns an incident into a log flood that buries the line explaining it.
 */
const lastLoggedAt = new Map<string, number>();

export function logThrottled(key: string, intervalMs: number, message: () => string): void {
  const now = Date.now();
  const previous = lastLoggedAt.get(key) ?? 0;
  if (now - previous < intervalMs) return;
  lastLoggedAt.set(key, now);
  console.warn(message());
}
