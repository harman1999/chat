import type { UserPreferences } from "@/types";

/** Defaults a new account starts with; also the reset target in settings. */
export const defaultPreferences: UserPreferences = {
  theme: "system",
  density: "comfortable",
  language: "en-GB",
  timezone: "Asia/Kolkata",
  messages: {
    sendBehavior: "enter",
    use24HourTime: false,
    showTypingIndicators: true,
    showLinkPreviews: true,
    groupConsecutive: true,
  },
  notifications: {
    desktopEnabled: true,
    playSound: true,
    channelLevel: "mentions",
    directMessages: "all",
    threadReplies: true,
    keywords: ["deploy", "incident", "on-call"],
    emailDigest: "daily",
    doNotDisturb: { enabled: true, from: "20:00", to: "08:00" },
  },
};

export const LANGUAGES = [
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-US", label: "English (United States)" },
  { value: "de-DE", label: "Deutsch" },
  { value: "fr-FR", label: "Français" },
  { value: "es-ES", label: "Español" },
  { value: "ja-JP", label: "日本語" },
  { value: "hi-IN", label: "हिन्दी" },
] as const;

export const TIMEZONES = [
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Singapore",
  "UTC",
] as const;

/** Suggestions offered by the status picker. */
export const STATUS_PRESETS = [
  { emoji: "📅", text: "In a meeting", minutes: 60 },
  { emoji: "🎧", text: "Heads down", minutes: 120 },
  { emoji: "🍽️", text: "At lunch", minutes: 60 },
  { emoji: "🏠", text: "Working remotely", minutes: null },
  { emoji: "🤒", text: "Off sick", minutes: null },
  { emoji: "🌴", text: "On holiday", minutes: null },
  { emoji: "🚌", text: "Commuting", minutes: 30 },
  { emoji: "🧪", text: "Reviewing PRs", minutes: 120 },
] as const;
