/** Presentation-only formatting helpers. No component may re-implement these. */

const DAY_MS = 86_400_000;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable avatar palette index so a user keeps the same colour everywhere. */
export function avatarPaletteIndex(seed: string, buckets = 8): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return hash % buckets;
}

export function formatTime(iso: string, locale = "en-US"): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDayDivider(iso: string, locale = "en-US"): string {
  const date = new Date(iso);
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round((today.getTime() - target.getTime()) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString(locale, { weekday: "long" });
  return date.toLocaleDateString(locale, {
    month: "long",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function formatRelative(iso: string, locale = "en-US"): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secondsInUnit] of units) {
    if (seconds >= secondsInUnit) return rtf.format(-Math.floor(seconds / secondsInUnit), unit);
  }
  return rtf.format(-seconds, "second");
}

export function formatCount(value: number, max = 99): string {
  return value > max ? `${max}+` : String(value);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)).getTime() === startOfDay(new Date(b)).getTime();
}

/** Compact count for stat tiles: 513 → "513", 4 812 → "4.8k", 138 402 → "138k". */
export function formatCompact(value: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: value < 10_000 ? 1 : 0,
  }).format(value);
}
