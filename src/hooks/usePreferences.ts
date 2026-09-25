"use client";

import { useCallback } from "react";
import { userService } from "@/services";
import { useSettingsStore } from "@/store";
import type { MessagePreferences, NotificationPreferences, UserPreferences } from "@/types";

/**
 * Preference setters that update the store immediately and write through to the
 * API. Settings must feel instant; a failed write is surfaced by the caller.
 */
export function usePreferences() {
  const store = useSettingsStore();

  const setTheme = useCallback((theme: UserPreferences["theme"]) => {
    useSettingsStore.getState().setTheme(theme);
    void userService.updatePreferences({ theme });
  }, []);

  const setDensity = useCallback((density: UserPreferences["density"]) => {
    useSettingsStore.getState().setDensity(density);
    void userService.updatePreferences({ density });
  }, []);

  const setLanguage = useCallback((language: string) => {
    useSettingsStore.getState().setLanguage(language);
    void userService.updatePreferences({ language });
  }, []);

  const setTimezone = useCallback((timezone: string) => {
    useSettingsStore.getState().setTimezone(timezone);
    void userService.updatePreferences({ timezone });
  }, []);

  const setMessagePreference = useCallback(
    <K extends keyof MessagePreferences>(key: K, value: MessagePreferences[K]) => {
      useSettingsStore.getState().setMessagePreference(key, value);
      void userService.updatePreferences({
        messages: { ...useSettingsStore.getState().messages },
      });
    },
    [],
  );

  const setNotificationPreference = useCallback(
    <K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) => {
      useSettingsStore.getState().setNotificationPreference(key, value);
      void userService.updatePreferences({
        notifications: { ...useSettingsStore.getState().notifications },
      });
    },
    [],
  );

  return {
    preferences: store,
    setTheme,
    setDensity,
    setLanguage,
    setTimezone,
    setMessagePreference,
    setNotificationPreference,
  };
}

/** Formatter bound to the 24-hour-time preference. */
export function useTimeFormatter() {
  const use24HourTime = useSettingsStore((state) => state.messages.use24HourTime);
  const language = useSettingsStore((state) => state.language);

  return useCallback(
    (iso: string) =>
      new Date(iso).toLocaleTimeString(language, {
        hour: use24HourTime ? "2-digit" : "numeric",
        minute: "2-digit",
        hour12: !use24HourTime,
      }),
    [language, use24HourTime],
  );
}
