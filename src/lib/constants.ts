/** Product identity and layout metrics shared across the shell. */

export const APP = {
  name: "Helix",
  tagline: "Team communication for engineering organisations",
  version: "0.1.0",
} as const;

export const LAYOUT = {
  topBarHeight: 52,
  sidebarWidth: 276,
  sidebarCollapsedWidth: 64,
  rightPanelWidth: 320,
  rightPanelWideWidth: 400,
  mobileBreakpoint: 768,
  tabletBreakpoint: 1024,
  rightPanelBreakpoint: 1280,
} as const;

export const AVATAR_PALETTE = [
  "bg-[oklch(0.62_0.15_258)]",
  "bg-[oklch(0.60_0.15_320)]",
  "bg-[oklch(0.62_0.14_178)]",
  "bg-[oklch(0.64_0.15_30)]",
  "bg-[oklch(0.58_0.14_295)]",
  "bg-[oklch(0.62_0.14_150)]",
  "bg-[oklch(0.66_0.14_70)]",
  "bg-[oklch(0.60_0.14_215)]",
] as const;

export const PRESENCE_LABEL: Record<string, string> = {
  online: "Online",
  away: "Away",
  dnd: "Do not disturb",
  offline: "Offline",
};
