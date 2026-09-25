/** Central keyboard shortcut registry — one source of truth for help dialogs. */

export interface Shortcut {
  id: string;
  keys: string[];
  label: string;
  group: "Navigation" | "Messaging" | "Application";
}

export const SHORTCUTS: Shortcut[] = [
  { id: "search", keys: ["Mod", "K"], label: "Open search", group: "Navigation" },
  { id: "jump", keys: ["Mod", "J"], label: "Jump to a conversation", group: "Navigation" },
  { id: "toggle-sidebar", keys: ["Mod", "B"], label: "Toggle workspace sidebar", group: "Navigation" },
  { id: "toggle-details", keys: ["Mod", "."], label: "Toggle details panel", group: "Navigation" },
  { id: "next-unread", keys: ["Alt", "Shift", "↓"], label: "Next unread conversation", group: "Navigation" },
  { id: "send", keys: ["Enter"], label: "Send message", group: "Messaging" },
  { id: "newline", keys: ["Shift", "Enter"], label: "New line", group: "Messaging" },
  { id: "edit-last", keys: ["↑"], label: "Edit last message", group: "Messaging" },
  { id: "reply", keys: ["T"], label: "Reply in thread", group: "Messaging" },
  { id: "react", keys: ["R"], label: "Add reaction", group: "Messaging" },
  { id: "theme", keys: ["Mod", "Shift", "L"], label: "Toggle light / dark theme", group: "Application" },
  { id: "shortcuts", keys: ["Mod", "/"], label: "Show keyboard shortcuts", group: "Application" },
];

/** Renders "Mod" as ⌘ on Apple platforms and Ctrl elsewhere. */
export function displayKey(key: string, isApple: boolean): string {
  if (key !== "Mod") return key;
  return isApple ? "⌘" : "Ctrl";
}

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? navigator.userAgent);
}
