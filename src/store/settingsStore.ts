"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultPreferences } from "@/config";
import type {
  MessagePreferences,
  NotificationPreferences,
  UserPreferences,
} from "@/types";

/**
 * Local mirror of the user's preferences.
 *
 * Persisted so the UI applies them before the first network round-trip, and
 * every setter writes through to `userService.updatePreferences` at the call
 * site — the store itself stays transport-free.
 */
interface SettingsState extends UserPreferences {
  setTheme: (theme: UserPreferences["theme"]) => void;
  setDensity: (density: UserPreferences["density"]) => void;
  setLanguage: (language: string) => void;
  setTimezone: (timezone: string) => void;
  setMessagePreference: <K extends keyof MessagePreferences>(
    key: K,
    value: MessagePreferences[K],
  ) => void;
  setNotificationPreference: <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) => void;
  hydrate: (preferences: UserPreferences) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultPreferences,

      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setLanguage: (language) => set({ language }),
      setTimezone: (timezone) => set({ timezone }),

      setMessagePreference: (key, value) =>
        set((state) => ({ messages: { ...state.messages, [key]: value } })),

      setNotificationPreference: (key, value) =>
        set((state) => ({ notifications: { ...state.notifications, [key]: value } })),

      hydrate: (preferences) => set(preferences),
      reset: () => set(defaultPreferences),
    }),
    {
      name: "helix.settings",
      version: 1,
      // Merge rather than replace, so a preference added in a later release
      // falls back to its default instead of arriving undefined.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<SettingsState>),
        messages: { ...current.messages, ...(persisted as SettingsState)?.messages },
        notifications: {
          ...current.notifications,
          ...(persisted as SettingsState)?.notifications,
          doNotDisturb: {
            ...current.notifications.doNotDisturb,
            ...(persisted as SettingsState)?.notifications?.doNotDisturb,
          },
        },
      }),
    },
  ),
);
