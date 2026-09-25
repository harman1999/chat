"use client";

import { Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useElementWidth } from "@/hooks";
import { cn } from "@/lib/utils";

export interface TrendPoint {
  date: string;
  value: number;
}

const PLOT_HEIGHT = 150;
const PAD = { top: 14, right: 10, bottom: 6, left: 40 };

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Single-measure trend over time.
 *
 * One series per chart by design — two measures on two y-scales would invent a
 * correlation that isn't in the data, so the dashboard pairs two of these
 * instead. A table view twin makes every value reachable without colour or hover.
 */
export function TrendChart({
  title,
  subtitle,
  data,
  unit,
}: {
  title: string;
  subtitle?: string;
  data: TrendPoint[];
  unit: string;
}) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const geometry = useMemo(() => {
    if (width === 0 || data.length === 0) return null;

    const innerWidth = Math.max(0, width - PAD.left - PAD.right);
    const innerHeight = PLOT_HEIGHT - PAD.top - PAD.bottom;
    const maxValue = niceCeiling(Math.max(...data.map((point) => point.value)));
    const step = data.length > 1 ? innerWidth / (data.length - 1) : 0;

    const x = (index: number) => PAD.left + index * step;
    const y = (value: number) => PAD.top + innerHeight - (value / maxValue) * innerHeight;

    const line = data.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`).join(" ");
    const area = `${line} L${x(data.length - 1)},${PAD.top + innerHeight} L${x(0)},${PAD.top + innerHeight} Z`;

    const peakIndex = data.reduce(
      (best, point, index) => (point.value > data[best].value ? index : best),
      0,
    );

    return { x, y, line, area, maxValue, innerHeight, step, peakIndex };
  }, [data, width]);

  const latest = data.at(-1);
  const active = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-2xs text-fg-subtle">{subtitle}</p>}
        </div>
        {latest && (
          <div className="text-right">
            <p className="text-lg font-semibold leading-none text-fg">
              {latest.value.toLocaleString()}
            </p>
            <p className="mt-1 text-2xs text-fg-subtle">latest</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={showTable ? "Show chart" : "Show data table"}
          aria-pressed={showTable}
          onClick={() => setShowTable((current) => !current)}
        >
          <Table2 />
        </Button>
      </header>

      {showTable ? (
        <div className="max-h-56 overflow-y-auto scrollbar-thin">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-1.5 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  Date
                </th>
                <th scope="col" className="px-4 py-1.5 text-right text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  {unit}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((point) => (
                <tr key={point.date} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-1.5 text-xs text-fg-muted">{formatDate(point.date)}</td>
                  <td className="px-4 py-1.5 text-right text-xs tabular-nums text-fg">
                    {point.value.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 pb-3 pt-2">
          <div ref={containerRef} className="relative">
            <svg
              width={width || 1}
              height={PLOT_HEIGHT}
              role="img"
              aria-label={`${title}. ${data.length} days, latest ${latest?.value.toLocaleString() ?? 0} ${unit}.`}
              className="block"
            >
              {geometry && (
                <>
                  {/* Recessive solid hairline grid — never dashed. */}
                  {[0, 0.5, 1].map((fraction) => {
                    const value = geometry.maxValue * (1 - fraction);
                    const yPos = geometry.y(value);
                    return (
                      <g key={fraction}>
                        <line
                          x1={PAD.left}
                          x2={width - PAD.right}
                          y1={yPos}
                          y2={yPos}
                          stroke="var(--chart-grid)"
                          strokeWidth={1}
                        />
                        <text
                          x={PAD.left - 8}
                          y={yPos + 3}
                          textAnchor="end"
                          className="fill-[var(--fg-subtle)] text-[9px] tabular-nums"
                        >
                          {value >= 1000 ? `${Math.round(value / 1000)}k` : Math.round(value)}
                        </text>
                      </g>
                    );
                  })}

                  <path d={geometry.area} fill="var(--accent)" fillOpacity={0.12} />
                  <path
                    d={geometry.line}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />

                  {/* Direct-label the peak only — a value on every point is noise,
                      and an unlabelled marker leaves the reader guessing why. */}
                  {hoverIndex === null && (
                    <g>
                      <circle
                        cx={geometry.x(geometry.peakIndex)}
                        cy={geometry.y(data[geometry.peakIndex].value)}
                        r={3}
                        fill="var(--accent)"
                        stroke="var(--surface)"
                        strokeWidth={2}
                      />
                      <text
                        x={Math.min(
                          Math.max(geometry.x(geometry.peakIndex), PAD.left + 18),
                          width - PAD.right - 18,
                        )}
                        y={Math.max(geometry.y(data[geometry.peakIndex].value) - 8, 10)}
                        textAnchor="middle"
                        className="fill-[var(--fg-muted)] text-[9px] font-semibold tabular-nums"
                      >
                        peak {data[geometry.peakIndex].value.toLocaleString()}
                      </text>
                    </g>
                  )}

                  {active && hoverIndex !== null && (
                    <>
                      <line
                        x1={geometry.x(hoverIndex)}
                        x2={geometry.x(hoverIndex)}
                        y1={PAD.top}
                        y2={PAD.top + geometry.innerHeight}
                        stroke="var(--border-strong)"
                        strokeWidth={1}
                      />
                      <circle
                        cx={geometry.x(hoverIndex)}
                        cy={geometry.y(active.value)}
                        r={4}
                        fill="var(--accent)"
                        stroke="var(--surface)"
                        strokeWidth={2}
                      />
                    </>
                  )}

                  {/* Hit bands span the full height so targets never require precision. */}
                  {data.map((point, index) => (
                    <rect
                      key={point.date}
                      x={geometry.x(index) - geometry.step / 2}
                      y={0}
                      width={Math.max(geometry.step, 8)}
                      height={PLOT_HEIGHT}
                      fill="transparent"
                      onMouseEnter={() => setHoverIndex(index)}
                      onMouseLeave={() => setHoverIndex(null)}
                    />
                  ))}
                </>
              )}
            </svg>

            {active && hoverIndex !== null && geometry && (
              <div
                role="status"
                className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-surface-raised px-2 py-1 shadow-md"
                style={{
                  left: Math.min(Math.max(geometry.x(hoverIndex), 56), width - 56),
                  top: Math.max(geometry.y(active.value) - 46, 0),
                }}
              >
                <p className="whitespace-nowrap text-2xs text-fg-subtle">{formatDate(active.date)}</p>
                <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-fg">
                  {active.value.toLocaleString()} {unit}
                </p>
              </div>
            )}
          </div>

          {/* Axis labels live in HTML so the card height always includes them. */}
          <div className={cn("mt-1 flex justify-between text-2xs text-fg-subtle")} style={{ paddingLeft: PAD.left }}>
            <span>{data[0] && formatDate(data[0].date)}</span>
            <span>{data[Math.floor(data.length / 2)] && formatDate(data[Math.floor(data.length / 2)].date)}</span>
            <span>{latest && formatDate(latest.date)}</span>
          </div>
        </div>
      )}
    </section>
  );
}
