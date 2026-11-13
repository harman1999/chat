"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTheme } from "next-themes";
import { applyAppearance } from "@/lib/appearance-colors";
import { userService } from "@/services";
import { useSettingsStore } from "@/store";

/** Pages that exist only for a signed-in person; elsewhere there is nothing to load. */
const SIGNED_IN_AREAS = ["/workspace", "/settings", "/admin"];

/**
 * Projects stored preferences onto the document.
 *
 * Density lives as a root attribute so every surface — chat, threads and the
 * settings preview — reads the same CSS variables, and the theme preference is
 * kept in step with next-themes on load. Custom sidebar and top bar colours are
 * set as CSS variables on the root (see lib/appearance-colors.ts).
 *
 * It also loads the account's saved preferences. The store is a local copy so
 * the screen can paint at once, but it belongs to one browser: without this, a
 * new browser (or a cleared one) showed defaults, and changing anything there
 * overwrote what the account had saved.
 */
export function PreferencesEffects() {
  const density = useSettingsStore((state) => state.density);
  const theme = useSettingsStore((state) => state.theme);
  const sidebarColor = useSettingsStore((state) => state.appearance.sidebarColor);
  const topbarColor = useSettingsStore((state) => state.appearance.topbarColor);
  const { setTheme, theme: activeTheme } = useTheme();

  const pathname = usePathname();
  const signedInArea = SIGNED_IN_AREAS.some((area) => pathname.startsWith(area));
  const saved = useQuery({
    queryKey: ["my-preferences"],
    queryFn: () => userService.getPreferences(),
    enabled: signedInArea,
    // Always asked again when this mounts: an older answer from the cache must
    // never be written over a change made since.
    refetchOnMount: "always",
    staleTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (saved.isFetchedAfterMount && saved.data) useSettingsStore.getState().hydrate(saved.data);
  }, [saved.isFetchedAfterMount, saved.dataUpdatedAt, saved.data]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  // The sidebar and top bar colours, when the person has chosen their own.
  useEffect(() => {
    applyAppearance({ sidebarColor, topbarColor });
  }, [sidebarColor, topbarColor]);

  useEffect(() => {
    if (activeTheme && activeTheme !== theme) setTheme(theme);
    // Only reconciles on load or when the stored preference changes; the
    // toggle writes both sides itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return null;
}
