/**
 * Custom sidebar and top bar colours.
 *
 * A person picks one colour per bar; everything else — the text on it, the
 * hover and selected states, the borders, the search field — is worked out from
 * it here, so any colour from near-black to near-white stays readable. Nothing
 * depends on the theme: a chosen colour is applied in light and dark alike, and
 * "no colour chosen" (null) leaves the theme's own colours alone.
 *
 * Pure functions only. Applying the result to the page is `applyAppearance`.
 */

export interface AppearanceColors {
  /** `#rrggbb`, or null for the theme's own colour. */
  sidebarColor: string | null;
  topbarColor: string | null;
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

type RGB = readonly [number, number, number];

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
/** Text on a light bar: a very dark slate, softer than pure black. */
const INK: RGB = [15, 23, 42];
/** Text on a dark bar: white with the faintest cool tint. */
const PAPER: RGB = [251, 251, 254];

export function parseHex(hex: string): RGB | null {
  if (!HEX_COLOR.test(hex)) return null;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as RGB;
}

export function toHex(rgb: RGB): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance. */
export function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (none) to 21 (black on white). */
export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `amount` of the way from `from` to `to`. */
function mix(from: RGB, to: RGB, amount: number): RGB {
  return from.map((c, i) => c + (to[i] - c) * amount) as unknown as RGB;
}

/**
 * The text colour for a background: the softer pair (paper or ink) when it
 * reads well, and pure white or black for the mid-tones where only those can
 * get as close to the target contrast as that colour allows.
 */
function bestText(on: RGB): RGB {
  const soft = contrast(on, PAPER) >= contrast(on, INK) ? PAPER : INK;
  if (contrast(on, soft) >= 4.5) return soft;
  return contrast(on, WHITE) >= contrast(on, BLACK) ? WHITE : BLACK;
}

/**
 * A lifted step (hover, selected, search field) toward `toward`, held back so the
 * text on it never loses much readability: a mid-tone bar has little room, so its
 * steps are smaller than a very dark or very light bar's.
 */
function lift(base: RGB, toward: RGB, amount: number, text: RGB): RGB {
  const floor = Math.max(3, contrast(text, base) - 0.5);
  for (let a = amount; a > 0.01; a -= 0.01) {
    const candidate = mix(base, toward, a);
    if (contrast(text, candidate) >= floor) return candidate;
  }
  return base;
}

/**
 * A softer version of the text colour for secondary text: moved toward the
 * background by up to `start`, but never so far that it falls below `min`
 * contrast (it is pulled back toward full strength until it clears it).
 */
function softened(text: RGB, background: RGB, start: number, min: number): RGB {
  for (let amount = start; amount > 0; amount -= 0.02) {
    const candidate = mix(text, background, amount);
    if (contrast(candidate, background) >= min) return candidate;
  }
  return text;
}

/** The steps shared by both bars: which way "lifted" points, and the text. */
function family(base: RGB) {
  const text = bestText(base);
  // Light text means a dark bar, where lighter means raised; on a light bar,
  // darker does.
  const isDark = text === PAPER || text === WHITE;
  const toward: RGB = isDark ? WHITE : BLACK;
  return { text, isDark, toward };
}

/** The sidebar's tokens (`--sidebar-*`), as hex. */
export function sidebarTokens(hex: string): Record<string, string> | null {
  const base = parseHex(hex);
  if (!base) return null;
  const { text, isDark, toward } = family(base);
  // Lighter steps need to be a little stronger than darker ones to read as much.
  const k = isDark ? 1 : 0.7;
  const active = lift(base, toward, 0.24 * k, text);
  return {
    "--sidebar": toHex(base),
    "--sidebar-elevated": toHex(lift(base, toward, 0.13 * k, text)),
    "--sidebar-hover": toHex(lift(base, toward, 0.09 * k, text)),
    "--sidebar-active": toHex(active),
    "--sidebar-border": toHex(mix(base, toward, 0.17 * k)),
    "--sidebar-fg": toHex(text),
    "--sidebar-muted": toHex(softened(text, base, 0.14, 4.5)),
    "--sidebar-subtle": toHex(softened(text, base, 0.3, 3.5)),
    "--sidebar-active-fg": toHex(bestText(active)),
    "--sidebar-ring": toHex(text),
  };
}

/** The top bar's tokens (`--topbar-*`), as hex. */
export function topbarTokens(hex: string): Record<string, string> | null {
  const base = parseHex(hex);
  if (!base) return null;
  const { text, isDark, toward } = family(base);
  const k = isDark ? 1 : 0.7;
  return {
    "--topbar-surface": toHex(base),
    "--topbar-surface-subtle": toHex(lift(base, toward, 0.07 * k, text)),
    "--topbar-surface-hover": toHex(lift(base, toward, 0.11 * k, text)),
    "--topbar-surface-active": toHex(lift(base, toward, 0.17 * k, text)),
    "--topbar-fg": toHex(text),
    "--topbar-fg-muted": toHex(softened(text, base, 0.12, 4.5)),
    "--topbar-fg-subtle": toHex(softened(text, base, 0.24, 3.5)),
    "--topbar-border": toHex(mix(base, toward, 0.14 * k)),
    "--topbar-border-strong": toHex(mix(base, toward, 0.24 * k)),
  };
}

/** localStorage key the page's head script reads, so colours are right on first paint. */
export const APPEARANCE_CACHE_KEY = "helix.appearance";

const SIDEBAR_VARS = Object.keys(sidebarTokens("#000000") ?? {});
const TOPBAR_VARS = Object.keys(topbarTokens("#000000") ?? {});

/**
 * Puts the chosen colours on the page, or takes them off.
 *
 * The values are set on the root element, where they outrank both themes' own
 * definitions. They are also written to localStorage as plain hex so a small
 * script in the document head can restore them before the first paint — without
 * it, a person with custom colours would see the default ones flash on every load.
 */
export function applyAppearance(colors: AppearanceColors): void {
  const root = document.documentElement;
  const sidebar = colors.sidebarColor ? sidebarTokens(colors.sidebarColor) : null;
  const topbar = colors.topbarColor ? topbarTokens(colors.topbarColor) : null;

  for (const name of SIDEBAR_VARS) {
    if (sidebar) root.style.setProperty(name, sidebar[name]);
    else root.style.removeProperty(name);
  }
  for (const name of TOPBAR_VARS) {
    if (topbar) root.style.setProperty(name, topbar[name]);
    else root.style.removeProperty(name);
  }
  if (topbar) root.setAttribute("data-topbar-custom", "");
  else root.removeAttribute("data-topbar-custom");

  try {
    if (sidebar || topbar) {
      localStorage.setItem(
        APPEARANCE_CACHE_KEY,
        JSON.stringify({ vars: { ...sidebar, ...topbar }, topbar: Boolean(topbar) }),
      );
    } else {
      localStorage.removeItem(APPEARANCE_CACHE_KEY);
    }
  } catch {
    /* storage can be unavailable (private windows); the colours still apply now */
  }
}

/**
 * The inline script for the document head. Reads only plain hex values for
 * `--sidebar*` / `--topbar*` properties and refuses anything else, so a tampered
 * cache entry cannot set arbitrary styles.
 */
export const APPEARANCE_HEAD_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("${APPEARANCE_CACHE_KEY}")||"null");if(s&&s.vars){var r=document.documentElement,h=/^#[0-9a-f]{6}$/i,n=/^--(sidebar|topbar)(-[a-z]+)*$/;for(var k in s.vars){if(n.test(k)&&h.test(s.vars[k]))r.style.setProperty(k,s.vars[k])}if(s.topbar)r.setAttribute("data-topbar-custom","")}}catch(e){}`;

/** Quick starting points; the picker allows any colour. */
export const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "Midnight", hex: "#020031" },
  { name: "Navy", hex: "#0b2a5b" },
  { name: "Ocean", hex: "#0e5a8a" },
  { name: "Teal", hex: "#0f766e" },
  { name: "Forest", hex: "#14532d" },
  { name: "Plum", hex: "#4a1d6b" },
  { name: "Berry", hex: "#9d174d" },
  { name: "Crimson", hex: "#991b1b" },
  { name: "Amber", hex: "#b45309" },
  { name: "Slate", hex: "#1e293b" },
  { name: "Graphite", hex: "#374151" },
  { name: "Cloud", hex: "#e8eef9" },
  { name: "Sand", hex: "#f3ead8" },
  { name: "White", hex: "#ffffff" },
];
