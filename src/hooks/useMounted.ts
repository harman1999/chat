"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Guards against hydration mismatches for theme- and storage-driven UI.
 * Returns `false` during SSR and the first client render, `true` afterwards.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
