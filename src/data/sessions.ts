import type { UserSession } from "@/types";

/** Mock active sessions, served by `userService` in mock mode. */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const sessions: UserSession[] = [
  {
    id: "sess_current",
    deviceKind: "web",
    deviceLabel: "Chrome on Linux",
    browser: "Chrome 128",
    location: "Bengaluru, India",
    ipAddress: "103.21.244.18",
    lastActiveAt: minutesAgo(0),
    createdAt: daysAgo(2),
    isCurrent: true,
  },
  {
    id: "sess_desktop",
    deviceKind: "desktop",
    deviceLabel: "Helix for macOS",
    browser: "Desktop app 1.4.2",
    location: "Bengaluru, India",
    ipAddress: "103.21.244.18",
    lastActiveAt: minutesAgo(35),
    createdAt: daysAgo(46),
    isCurrent: false,
  },
  {
    id: "sess_mobile",
    deviceKind: "mobile",
    deviceLabel: "Helix for iOS",
    browser: "iPhone 15 Pro",
    location: "Bengaluru, India",
    ipAddress: "49.37.12.90",
    lastActiveAt: minutesAgo(180),
    createdAt: daysAgo(120),
    isCurrent: false,
  },
  {
    id: "sess_stale",
    deviceKind: "web",
    deviceLabel: "Firefox on Windows",
    browser: "Firefox 130",
    location: "Frankfurt, Germany",
    ipAddress: "185.60.216.35",
    lastActiveAt: daysAgo(12),
    createdAt: daysAgo(90),
    isCurrent: false,
  },
];
