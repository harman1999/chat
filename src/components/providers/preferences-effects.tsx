"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useSettingsStore } from "@/store";

/**
 * Projects stored preferences onto the document.
 *
 * Density lives as a root attribute so every surface — chat, threads and the
 * settings preview — reads the same CSS variables, and the theme preference is
 * kept in step with next-themes on load.
 */
export function PreferencesEffects() {
  const density = useSettingsStore((state) => state.density);
  const theme = useSettingsStore((state) => state.theme);
  const { setTheme, theme: activeTheme } = useTheme();

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  useEffect(() => {
    if (activeTheme && activeTheme !== theme) setTheme(theme);
    // Only reconciles on load or when the stored preference changes; the
    // toggle writes both sides itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return null;
}
