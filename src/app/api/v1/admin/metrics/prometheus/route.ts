import { handler } from "@server/lib/http";
import { snapshot } from "@server/lib/metrics";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";

/**
 * The same counters in Prometheus text format.
 *
 * The JSON endpoint next door is for the admin dashboard; this is for a
 * scraper. Same source, two renderings — a scraper cannot read the JSON shape
 * and a dashboard should not have to parse exposition format.
 *
 * Still authenticated: these counts describe traffic and rejection patterns,
 * which is not something to publish. Scrapers use a bot token.
 */
export const GET = handler(
  async () => {
    const { user } = await requireSession();
    await requirePermission(user.id, "p_admin_settings");

    const metrics = snapshot();
    const lines: string[] = [];

    // Prometheus expects metric names with underscores, not dots.
    const grouped = new Map<string, typeof metrics.counters>();
    for (const counter of metrics.counters) {
      const name = `helix_${counter.name.replace(/\./g, "_")}_total`;
      grouped.set(name, [...(grouped.get(name) ?? []), counter]);
    }

    for (const [name, counters] of grouped) {
      lines.push(`# TYPE ${name} counter`);
      for (const counter of counters) {
        // A label value containing a quote or backslash would produce a line
        // the scraper rejects outright.
        const label = counter.label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        lines.push(`${name}{label="${label}"} ${counter.count}`);
      }
    }

    // Always emitted, even at zero: a gauge that only appears once something
    // goes wrong cannot be alerted on before it does.
    lines.push("# TYPE helix_process_uptime_seconds gauge");
    lines.push(`helix_process_uptime_seconds ${metrics.uptimeSeconds}`);

    return new Response(`${lines.join("\n")}\n`, {
      headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
    });
  },
  // A scrape every 15s per instance would otherwise spend the default bucket.
  { rateLimit: false },
);
